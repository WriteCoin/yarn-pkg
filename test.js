const xs = []

for (let i = 0; i < 10; i++) {
    const x = { x: 1 }
    if (!xs.includes(x)) {
        xs.push(x)
    }
}

console.log(xs)
