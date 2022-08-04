const { program } = require("commander")
const chalk = require("chalk")
const {
    getPackage,
    installPackages,
    getPackageStructure,
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
    .action((packages, cmd) => {
        try {
            actionInstallPackages(packages, cmd)
        } catch (e) {
            console.error(
                chalk.red("Ошибка в алгоритме установки зависимостей %s"),
                e
            )
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
    .action((_, cmd) => {
        console.log(chalk.bold("Установка зависимостей из package.json"))

        console.log(cmd)
    })

program.parse(process.argv)
