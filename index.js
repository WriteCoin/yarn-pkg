const fs = require("fs")
const Path = require("path")
const chalk = require("chalk")
const { execSync } = require("child_process")
const semver = require("semver")
const files = require("files")

const JSON_VERSIONS_FILE_NAME = "versions.json"

const getPackage = (path) => {
    const content = fs.readFileSync(Path.join(path, "package.json"), "utf-8")
    return JSON.parse(content)
}

const getGlobalDir = () => {
    return execSync("yarn global dir").toString().trim()
}

const npmPath = Path.join(process.cwd(), "node_modules")
if (!fs.existsSync(npmPath)) {
    fs.mkdirSync(npmPath)
}

const getLinksDir = () => {
    try {
        const globalDir = getGlobalDir()
        // console.log("Путь к Yarn", globalDir)
        const linksPath = Path.join(globalDir, "../", "links")
        if (!fs.existsSync(linksPath)) {
            fs.mkdirSync(linksPath)
        }
        return linksPath
    } catch (e) {
        console.error(
            chalk.red("Ошибка с определением папки для хранения симлинков %s"),
            e
        )
        // console.log(e.stack)
        process.exit(-1)
    }
}

const linksDir = getLinksDir()
// const cwdCfgPackage = getPackage("./")

const getPackageStructure = (package) => {
    const p = package.split("@")
    let name, version
    if (p.length === 3) {
        name = "@" + p[1]
        version = p[2]
    } else {
        name = p[0]
        version = p[1]
    }
    // version ??= "latest"
    return [name, version]
}

const serializePackage = (package) => {
    return `${package[0]}@${package[1]}`
}

const pavePathsToLinks = (packageName) => {
    const paths = packageName.split(Path.posix.sep)
    let prePath = linksDir
    paths.forEach((path) => {
        prePath = Path.join(prePath, path)
        if (!fs.existsSync(prePath)) {
            fs.mkdirSync(prePath)
        }
    })
}

const isSymLinkExists = (linkPath) => {
    return fs.existsSync(linkPath) && fs.existsSync(fs.readlinkSync(linkPath))
}

const getLinksPackagePath = (package) => {
    const [name, version] = package
    return Path.join(linksDir, name, version)
}

const getCachedVersionsFromSepJson = async () => {
    console.log("Получение закешированных версий")
    const getPackageVersions = async (dir, prePackageName) => {
        console.log("Получение версий пакета, папка", dir)
        const ls = await files.ls(dir)
        let dirs = []
        let jsonFiles = []
        for (const path of ls) {
            if (await files.stat(path).isDirectory()) {
                try {
                    isSymLinkExists(path)
                } catch {
                    dirs.push(path)
                }
            } else if (path.endsWith(".json")) {
                jsonFiles.push(path)
            }
        }
        if (dirs.length > 0) {
            console.log("Обход вложенных папок", dirs)
            for (const dir of dirs) {
                return getPackageVersions(
                    dir,
                    Path.posix.join(prePackageName, Path.basename(dir))
                )
            }
        } else {
            console.log("Получение версий по именам файлов", jsonFiles)
            const packageName = prePackageName
            const packageVersions = jsonFiles.map(
                (file) => Path.parse(file).name
            )
            console.log("Имя пакета", packageName)
            console.log("Версии: ", packageVersions)
            return {
                [packageName]: packageVersions,
            }
        }
    }
    const ls = await files.ls(linksDir)
    let versions = []
    for (const path of ls) {
        if (await files.stat(path).isFile()) {
            continue
        }
        versions.push(await getPackageVersions(path, Path.basename(path)))
    }
    const result = versions.reduce((acc, obj) => Object.assign(acc, obj), {})
    return result
}

const getCachedVersions = async () => {
    console.log("Получение закешированных версий")
    const getPackageVersions = async (dir, prePackageName) => {
        console.log("Получение версий пакета, папка", dir)
        const ls = await files.ls(dir)
        let dirs = []
        let jsonPath
        for (const path of ls) {
            if (await files.stat(path).isDirectory()) {
                try {
                    isSymLinkExists(path)
                } catch {
                    dirs.push(path)
                }
            } else if (Path.basename(path) === JSON_VERSIONS_FILE_NAME) {
                jsonPath = path
            }
        }
        if (dirs.length > 0) {
            console.log("Обход вложенных папок", dirs)
            for (const dir of dirs) {
                return getPackageVersions(
                    dir,
                    Path.posix.join(prePackageName, Path.basename(dir))
                )
            }
        } else {
            console.log(
                "Получение версий, файл",
                JSON_VERSIONS_FILE_NAME,
                "найден?",
                !!jsonPath
            )
            const packageName = prePackageName
            if (!jsonPath) {
                return { [packageName]: [] }
            }
            const packageVersions = JSON.parse(
                fs.readFileSync(jsonPath, "utf-8")
            )
            console.log("Имя пакета", packageName)
            console.log("Версии: ", packageVersions)
            return {
                [packageName]: packageVersions,
            }
        }
    }
    const ls = await files.ls(linksDir)
    let versions = []
    for (const path of ls) {
        if (await files.stat(path).isFile()) {
            continue
        }
        versions.push(await getPackageVersions(path, Path.basename(path)))
    }
    const result = versions.reduce((acc, obj) => Object.assign(acc, obj), {})
    return result
}

let allVersions

const getSharedCachedVersions = async () => {
    allVersions = await getCachedVersions()
}

const getPackageWithExactedVersion = (packageWithSemanticVersion) => {
    const [name, version] = packageWithSemanticVersion
    if (!allVersions[name]) {
        throw new Error("Версии закешированного пакета отсутствуют")
    }
    const packageInfo = { data: { versions: allVersions[name] } }
    const packageWithExactedVersion = [name, findVersion(packageInfo, version)]
    if (!packageWithExactedVersion) {
        throw new Error("Не удалось определить версию закешированного пакета")
    }
    return packageWithExactedVersion
}

const getCachedPackageInfo = (package) => {
    const pathToJson = `${getLinksPackagePath(package)}.json`
    return JSON.parse(fs.readFileSync(pathToJson, "utf-8"))
}

const getPackageInfoFromCommand = (package) => {
    const info = execSync(`yarn info ${serializePackage(package)} --json`)
        .toString()
        .trim()
    return JSON.parse(info)
}

const cachePackageInfo = (info) => {
    fs.writeFileSync(pathToJson, JSON.stringify(info))
}

const updatePackageVersions = (packageWithExactedVersion) => {
    const pathToVersions = `${getLinksPackagePath(
        packageWithExactedVersion
    )}${JSON_VERSIONS_FILE_NAME}`
    const newVersion = packageWithExactedVersion[1]
    const oldVersions = JSON.parse(fs.readFileSync(pathToVersions, "utf-8"))
    let newVersions
    if (!oldVersions.includes(newVersion)) {
        newVersions = [...oldVersions, newVersion]
    } else {
        newVersions = oldVersions
    }
    fs.writeFileSync(pathToVersions, JSON.stringify(newVersions))
}

const getPackageInfo = (package) => {
    try {
        const packageWithExactedVersion = getPackageWithExactedVersion(package)
        try {
            return getCachedPackageInfo(packageWithExactedVersion)
        } catch {
            const resultInfo = getPackageInfoFromCommand(
                packageWithExactedVersion
            )
            cachePackageInfo(resultInfo)
            updatePackageVersions(packageWithExactedVersion)
            return resultInfo
        }
    } catch (e) {
        console.error(
            chalk.red("Ошибка при получении информации о пакете %s"),
            e
        )
    }
}

const linkInstalledPackage = (packageName, packageVersion) => {
    const linkPackagePath = getLinksPackagePath([packageName, packageVersion])
    const isExists = isSymLinkExists(linkPackagePath)
    const packagePath = `${packageName}@${packageVersion}`
    console.log(`Зависимость ${packagePath} уже установлена?`, isExists)
    if (isExists) {
        try {
            const dependencyPath = Path.join(npmPath, packageName)
            console.log("Полный путь к зависимости", dependencyPath)

            if (fs.existsSync(dependencyPath)) {
                // const depSemanticVersion =
                //     cwdCfgPackage.dependencies[packageName]
                // const isEqualVersionDep =
                //     depSemanticVersion &&
                //     semver.satisfies(packageVersion, depSemanticVersion)
                // const devDepSemanticVersion =
                //     cwdCfgPackage.devDependencies[packageName]
                // const isEqualVersionDevDep =
                //     devDepSemanticVersion &&
                //     semver.satisfies(packageVersion, devDepSemanticVersion)
                const linkContent = fs.readlinkSync(linkPackagePath)
                const isAnotherPackage =
                    Path.normalize(linkContent) !==
                    Path.normalize(dependencyPath)
                if (isAnotherPackage) {
                    console.log("Версии не совпадают")
                    fs.rm(dependencyPath, {
                        recursive: true,
                        force: true,
                    })
                } else {
                    console.log(
                        chalk.yellowBright("Пакет %s уже установлен локально"),
                        packagePath
                    )
                    return
                }
            }
            fs.symlinkSync(linkPackagePath, dependencyPath, "dir")
            console.log(
                chalk.green(
                    `Символическая ссылка на уже существующую зависимость ${packagePath} успешно создана.`
                )
            )
        } catch (e) {
            console.error(
                chalk.red(`Ошибка при создании символической ссылки: %s`),
                e
            )
            // console.log(e.stack)
        }
    } else {
        if (fs.existsSync(linkPackagePath)) {
            fs.rm(linkPackagePath, { recursive: true, force: true })
        }
        return [packageName, packageVersion]
    }
}

const addLinks = (packages) => {
    console.log(chalk.bold("Добавление ссылок на зависимости"))
    for (const [name, version] of packages) {
        const packagePath = `${name}@${version}`
        const packageDir = Path.join(linksDir, name)
        pavePathsToLinks(name)
        // const linkPackagePath = getLinksPackagePath([name, version])
        const linkPackagePath = Path.join(packageDir, version)
        if (!isSymLinkExists(linkPackagePath)) {
            const dependencyPath = Path.join(npmPath, name)
            console.log("Полный путь к зависимости", dependencyPath)
            if (fs.existsSync(linkPackagePath)) {
                fs.rm(linkPackagePath, { recursive: true, force: true })
            }
            fs.symlinkSync(dependencyPath, linkPackagePath, "dir")
            console.log(
                chalk.green(`Ссылка на зависимость %s успешно создана`),
                packagePath
            )
        } else {
            console.log(
                chalk.yellowBright(
                    `Ссылка на зависимость %s уже существует в хранилище симлинков`
                ),
                packagePath
            )
        }
    }
}

const findVersion = (packageInfo, semanticVersion) => {
    const versions = packageInfo.data.versions
    semanticVersion ??= "latest"
    // console.log("Версии", versions)
    // console.log("Семантическая версия", semanticVersion)
    if (semanticVersion === "latest") {
        return versions[versions.length - 1]
    }
    return versions.filter((version) => {
        const cond = semver.satisfies(version, semanticVersion)
        // console.log("Версия", version, "подходит", cond)
        return cond
    })[0]
}

const getPackageDependencies = (package, cyclicCondler, packageHandler) => {
    try {
        const [packageName, packageSemanticVersion] = package
        const info = getPackageInfo(package)
        const addedPackages = {}
        const getTree = (packageInfo) => {
            const packageExactVersion = findVersion(
                packageInfo,
                packageSemanticVersion
            )
            const packageKey = serializePackage([
                packageInfo.data.name,
                packageExactVersion,
            ])
            addedPackages[packageKey] ??= packageInfo
            let entriesDependencies
            if (!packageInfo.data.dependencies) {
                entriesDependencies = null
            } else {
                entriesDependencies = Object.entries(
                    packageInfo.data.dependencies
                ).map((entry) => {
                    const dependencyName = entry[0]
                    const dependencySemanticVersion = entry[1]

                    const dependencyInfo = getPackageDependencies(
                        [dependencyName, dependencySemanticVersion],
                        cyclicCondler,
                        packageHandler
                    )
                    const dependencyExactVersion = dependencyInfo
                        ? null
                        : findVersion(dependencyInfo, dependencySemanticVersion)

                    const isCyclic =
                        !dependencyInfo ||
                        Object.entries(addedPackages).filter((entry) => {
                            const packageKey = entry[0]
                            const packageInfo = entry[1]
                            const packageExactVersion =
                                getPackageStructure(packageKey)[1]

                            return (
                                packageInfo.data.name ===
                                    dependencyInfo.data.name &&
                                packageExactVersion === dependencyExactVersion
                            )
                        }).length > 0

                    const dependency = isCyclic ? null : dependencyInfo
                    return {
                        dependency,
                        semanticVersion: dependencySemanticVersion,
                        exactVersion: dependencyExactVersion,
                    }
                })
            }

            const dependencies = entriesDependencies
                ? Object.fromEntries(entriesDependencies)
                : null
            if (cyclicCondler(packageInfo, packageExactVersion)) {
                packageHandler(packageInfo, package)
            }
            return {
                ...packageInfo,
                data: {
                    ...packageInfo.data,
                    dependencies,
                },
            }
        }

        return getTree(info)
    } catch (e) {
        console.error(chalk.red("Ошибка при получении зависимостей пакета"), e)
    }
}

const installPackages = (packages, isDev) => {
    const packagesInTree = {}
    const nonInstalledPackages = []
    const nestedNonInstalledPackages = []
    for (const package of packages) {
        let [packageName, packageVersion] = package
        const treePackage = getPackageDependencies(
            package,
            (packageInfo, packageExactVersion) => {
                const packageKey = serializePackage([
                    packageInfo.data.name,
                    packageExactVersion,
                ])
                if (!packagesInTree[packageKey]) {
                    packagesInTree[packageKey] = packageInfo
                    return true
                }
                return false
            },
            (packageInfo, package) => {
                const semanticVersion = package[1]
                // console.log(package)
                if (
                    packageInfo.data.name === packageName &&
                    // semver.satisfies(packageInfo.data.version, semanticVersion)
                    packageVersion === semanticVersion
                ) {
                    // console.log("Основная зависимость")
                    return
                }
                const exactVersion = findVersion(packageInfo, semanticVersion)
                const nonInstalledPackage = linkInstalledPackage(
                    packageInfo.data.name,
                    exactVersion
                )
                if (nonInstalledPackage) {
                    nestedNonInstalledPackages.push(nonInstalledPackage)
                }
            }
        )
        packageVersion ??= "latest"
        const exactVersion = findVersion(treePackage, packageVersion)
        // console.log("Точная версия: ", exactVersion)
        const nonInstalledPackage = linkInstalledPackage(
            treePackage.data.name,
            exactVersion
        )
        if (nonInstalledPackage) {
            nonInstalledPackages.push(nonInstalledPackage)
        }
    }
    // const json =
    //     Object.values(packagesInTree).reduce((acc, o) => {
    //         return acc + "," + JSON.stringify(o)
    //     }, "[") + "]"
    // fs.writeFileSync("deps.json", json, "utf-8")
    // return

    // const nestedNonInstalledPackages = nestedNonInstalledPackages.filter(
    //     (nonInstalledPackage) =>
    //         !nonInstalledPackages.includes(nonInstalledPackage)
    // )

    const cmdPackages = nonInstalledPackages.reduce(
        (acc, nonInstalledPackage) => `${acc} ${nonInstalledPackage.join("@")}`,
        ""
    )
    if (cmdPackages) {
        console.log("Зависимости, которые нужно установить", cmdPackages)
        let cmd = `yarn add ${"-D" ? isDev : ""} ${cmdPackages}`
        execSync(cmd, { stdio: "inherit" })
        // try {
        //     console.log("Зависимости, которые нужно установить", cmdPackages)
        //     let cmd = `yarn add ${"-D" ? isDev : ""} ${cmdPackages}`
        //     execSync(cmd, { stdio: "inherit" })
        // } catch (e) {
        //     console.error(chalk.red("Ошибка при установке зависимости %s"), e)
        // }

        addLinks(nonInstalledPackages)
        addLinks(nestedNonInstalledPackages)
    }
}

module.exports = {
    getPackage,
    serializePackage,
    getLinksDir,
    linkInstalledPackage,
    installPackages,
    getPackageStructure,
    getLinksPackagePath,
    getPackageInfo,
    findVersion,
    getCachedVersionsFromSepJson,
    getCachedVersions,
    getSharedCachedVersions,
}
