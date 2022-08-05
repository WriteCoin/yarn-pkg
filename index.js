const fs = require("fs")
const Path = require("path")
const chalk = require("chalk")
const { execSync } = require("child_process")
const semver = require("semver")

const getPackage = (path) => {
    const content = fs.readFileSync(Path.join(path, "package.json"), "utf-8")
    return JSON.parse(content)
}

const getGlobalDir = () => {
    return execSync("yarn global dir").toString().trim()
}

const npmPath = Path.join(process.cwd(), "node_modules")

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

const getPackageInfo = (packageName) => {
    try {
        const info = execSync(`yarn info ${packageName} --json`)
            .toString()
            .trim()
        return JSON.parse(info)
    } catch (e) {
        console.error(
            chalk.red("Ошибка при получении информации о пакете %s"),
            e
        )
    }
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
const cwdCfgPackage = getPackage("./")

const isSymLinkExists = (linkPath) => {
    return fs.existsSync(linkPath)
}

const getLinksPackagePath = (package) => {
    const [name, version] = package
    return Path.join(linksDir, name, version)
}

const linkInstalledPackage = (packageName, packageVersion) => {
    const linkPackagePath = getLinksPackagePath([packageName, packageVersion])
    const isExists = isSymLinkExists(linkPackagePath)
    const packagePath = `${packageName}@${packageVersion}`
    // console.log(`Зависимость ${packagePath} уже установлена?`, isExists)
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
        return [packageName, packageVersion]
    }
}

const addLinks = (packages) => {
    console.log(chalk.bold("Добавление ссылок на зависимости"))
    for (const [name, version] of packages) {
        const packagePath = `${name}@${version}`
        const packageDir = Path.join(linksDir, name)
        if (!fs.existsSync(packageDir)) {
            fs.mkdirSync(packageDir)
        }
        // const linkPackagePath = getLinksPackagePath([name, version])
        const linkPackagePath = Path.join(packageDir, version)
        if (!isSymLinkExists(linkPackagePath)) {
            const dependencyPath = Path.join(npmPath, name)
            console.log("Полный путь к зависимости", dependencyPath)
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
    return packageInfo.data.versions.filter((version) =>
        semver.satisfies(version, semanticVersion)
    )[0]
}

const getPackageDependencies = (package, cyclicCondler, packageHandler) => {
    try {
        const [packageName, packageSemanticVersion] = package
        const info = getPackageInfo(packageName)
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
        const nonInstalledPackage = linkInstalledPackage(
            treePackage.data.name,
            treePackage.data.version
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
}
