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
    version ??= "latest"
    return [name, version]
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
        console.log("Путь к Yarn", globalDir)
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

const isSymLinkExists = (linkPath) => {
    return fs.existsSync(linkPath)
}

const getLinksPackagePath = (package) => {
    const [name, version] = package
    return Path.join(getLinksDir(), name, version)
}

const linkInstalledPackage = (packageName, packageVersion) => {
    const linkPackagePath = getLinksPackagePath([packageName, packageVersion])
    const isExists = isSymLinkExists(linkPackagePath)
    console.log(`Зависимость ${packagePath} уже установлена?`, isExists)
    if (isExists) {
        try {
            const dependencyPath = Path.join(npmPath, packageName)
            console.log("Полный путь к зависимости", dependencyPath)
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
        const linkPackagePath = getLinksPackagePath([name, version])
        if (!isSymLinkExists(linkPackagePath)) {
            const dependencyPath = Path.join(npmPath, name)
            console.log("Полный путь к зависимости", dependencyPath)
            fs.symlinkSync(dependencyPath, linkPackagePath, "dir")
            console.log(
                chalk.green(`Ссылка на зависимость %s успешно создана`),
                packagePath
            )
        }
    }
}

// const findVersion = (data, )

const getPackageDependencies = (package) => {
    try {
        const info = getPackageInfo(package)
        const data = info.data
        const getDep = (dep) =>
            Object.keys(dep).map((name) => {
                const infoDep = getPackageInfo(name)
                const version = infoDep.data.versions.filter((version) =>
                    semver.satisfies(version, dep[name])
                )[0]
                return [name, dep[name]]
            })
        return {
            dependencies: data.dependencies
                ? getDep(data.dependencies)
                : undefined,
            devDependencies: data.devDependencies
                ? getDep(data.devDependencies)
                : undefined,
        }
    } catch (e) {
        console.error(chalk.red("Ошибка при получении зависимостей пакета"), e)
    }
}

const installPackages = (packages, isDev) => {
    const nonInstalledPackages = []
    for (const package of packages) {
        const [packageName, packageVersion] = package
        const nonInstalledPackage = linkInstalledPackage(
            packageName,
            packageVersion
        )
        if (nonInstalledPackage) {
            nonInstalledPackages.push(nonInstalledPackage)
        }
        // const infoPackage = getPackageInfo(packageName)
        const dependencyPackages = getPackageDependencies()
    }
    const cmdPackages = nonInstalledPackages.reduce(
        (acc, nonInstalledPackage) => `${acc} ${nonInstalledPackage.join("@")}`,
        ""
    )
    if (cmdPackages) {
        try {
            console.log("Зависимости, которые нужно установить", cmdPackages)
            let cmd = `yarn add ${"-D" ? isDev : ""} ${cmdPackages}`
            execSync(cmd, { stdio: "inherit" })
        } catch (e) {
            console.error(chalk.red("Ошибка при установке зависимости %s"), e)
        }

        addLinks(nonInstalledPackages)
    }
}

module.exports = {
    getPackage,
    getLinksDir,
    linkInstalledPackage,
    installPackages,
    getPackageStructure,
    getLinksPackagePath,
    getPackageInfo,
}
