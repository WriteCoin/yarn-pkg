const { getPackageInfo } = require(".")
const fs = require("fs")

const info = getPackageInfo("query-string")
// console.log(info, typeof info)
const infoParsed = JSON.parse(info)

const data = infoParsed.data

fs.writeFileSync("info_query_string.json", info)
