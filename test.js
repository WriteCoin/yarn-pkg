// const xs = []

const { serializePackage } = require(".")
const semver = require('semver')

// for (let i = 0; i < 10; i++) {
//     const x = { x: 1 }
//     if (!xs.includes(x)) {
//         xs.push(x)
//     }
// }

// console.log(xs)

const key = serializePackage(["split-on-first", "^1.0.0"])
console.log(key)

let c = semver.satisfies('1.2.3', undefined)

console.log(c)