const { program } = require("commander")
const chalk = require("chalk")
const {
    getPackage,
    installPackages,
    getPackageStructure,
    getCachedVersions,
    getSharedCachedVersions,
} = require("./index.js")

const thisPackage = getPackage(__dirname)

program
    .version(thisPackage.version)
    .description("Установка зависимостей для пакетного менеджера Yarn.")

const actionInstallPackages = (packages, cmd) => {
    console.log(chalk.bold("Установка зависимостей: "))

    const inputPackages = packages.map((package) =>
        getPackageStructure(package)
    )
    const isDev = cmd.dev || false
    console.log("Входные зависимости", inputPackages)
    console.log("Для разработки?", isDev)
    installPackages(inputPackages, isDev)
}

program
    .command("install <packages...>")
    .option("-D, --dev", "Установить как зависимость для разработки")
    .alias("i")
    .description("Установить выбранные зависимости.")
    .action(async (packages, cmd) => {
        await getSharedCachedVersions()
        try {
            actionInstallPackages(packages, cmd)
        } catch (e) {
            console.error(
                chalk.red("Ошибка в алгоритме установки зависимостей %s"),
                e
            )
            console.log(chalk.red("%s"), e.stack)
        }
    })

program
    .command("install-all")
    .option(
        "-P, --production",
        "Установить зависимости только для работы приложения, без devDependencies"
    )
    .alias("ia")
    .description("Установить зависимости из package.json")
    .action(async (_, cmd) => {
        await getSharedCachedVersions()
        console.log(chalk.bold("Установка зависимостей из package.json"))

        const cfgPackage = getPackage(process.cwd())
        if (!cmd.production) {
            const inputDevDependencies = Object.entries(
                cfgPackage.dependencies
            ).map((package) =>
                getPackageStructure(`${package[0]}@${package[1]}`)
            )
            installPackages(inputDevDependencies, true)
        }
        const inputDependencies = Object.entries(
            cfgPackage.devDependencies
        ).map((package) => getPackageStructure(`${package[0]}@${package[1]}`))
        installPackages(inputDependencies, false)
    })

program.parse(process.argv)
