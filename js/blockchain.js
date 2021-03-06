const file = require('./file.js')
const hash = require('./hashing.js')
const ecdsa = require('./ecdsa.js')
const parse = require('./parse.js')

function getBlock(hash,callback) {
    file.get(hash,'blockchain',callback)
}

function checkBalance(key,amount,callback) {
    file.get(key,'balances',(balance) => {
        // returns true if the wallet's balance is
        // less than or equal to the amount requested
        callback(balance >= amount)
    },0)
}

function calcBalances() {
    const miningreward = 50000000
    // mainChain gets the longest chain, as only the blocks under the highest
    // actually count
    mainChain((chain) => {
        var balances = {}
        // iterate through the blocks
        for (var key in chain) {
            var block = chain[key]
            transactions = block.transactions
            // iterate through each block to find each transaction
            transactions.forEach((transaction) => {
                // iterate through the inputs
                transaction.from.forEach((from) => {
                    // deduct amounts from the inputs
                    if (balances.hasOwnProperty(from.wallet)) {
                        balances[from.wallet] -= from.amount
                    } else {
                        balances[from.wallet] = -from.amount
                    }
                    // add amount to the recipient's balance
                    if (balances.hasOwnProperty(transaction.to)) {
                        balances[transaction.to] += from.amount
                    } else {
                        balances[transaction.to] = from.amount
                    }
                })
            })
            // mining rewards
            if (balances.hasOwnProperty(block.miner)) {
                balances[block.miner] += miningreward
            } else {
                balances[block.miner] = miningreward
            }
        }
        // calculating the balance in the corner
        file.getAll('wallets',(data) => {
            var wallets = JSON.parse(data)
            var newWallets = []
            var balance = 0
            wallets.forEach((wallet) => {
                if (balances.hasOwnProperty(wallet.public)) {
                    amount = balances[wallet.public]
                } else {
                    amount = 0
                }
                // add the au in the wallet to the total balance
                balance += amount
                // and set the balance in the wallet
                newWallets.push({
                    "name": wallet.name,
                    "public": wallet.public,
                    "private": wallet.private,
                    "amount": amount
                })
            })
            // change microau to au and set the textcontent of the top left thing
            document.getElementById('current-balance').textContent = balance / 1000000
            // save balances
            file.storeAll('wallets',newWallets)
            file.storeAll('balances',balances)
        },'[]')
    })
}

function addBlock(msg) {
    try {
        parse.block(msg.body)
        // if it failed the test, an error will have been thrown
        file.store(hash.sha256hex(JSON.stringify(msg.body)),msg.body,'blockchain')
        console.log('Block added')
        file.getAll('txpool',(data) => {
            var txpool = JSON.parse(data)
            msg.body.transactions.forEach((tx) => {
                // remove pending transactions if they're in the received block
                txpool.splice(txpool.indexOf(tx),1)
            })
            file.storeAll('txpool',txpool)
            calcBalances()
        },'[]')
    } catch(e) {
        console.warn('Block failed:',JSON.stringify(msg))
        console.warn(e)
    }
}

function mainChain(callback) {
    var mainchain = {}
    file.getAll('blockchain',(data) => {
        if (data === '{}') {
            callback({})
        } else {
            var fullchain = JSON.parse(data)
            getTopBlock(fullchain,(top) => {
                mainchain[top] = fullchain[top]
                var current = top
                var parent
                while (fullchain[current].parent !== '0000000000000000000000000000000000000000000000000000000000000000') {
                    parent = fullchain[current].parent
                    mainchain[parent] = fullchain[parent]
                    current = parent
                }
                callback(mainchain)
            })
        }
    },'{}')
}

function getChain(top,callback) {
    var mainchain = {}
    file.getAll('blockchain',(data) => {
        if (data === '{}') {
            callback(null)
        } else {
            try {
                var fullchain = JSON.parse(data)
                mainchain[top] = fullchain[top]
                var current = top
                var parent
                while (fullchain[current].parent !== '0000000000000000000000000000000000000000000000000000000000000000') {
                    parent = fullchain[current].parent
                    mainchain[parent] = fullchain[parent]
                    current = parent
                }
            } catch(e) {
                console.warn(e)
                mainchain = null
            } finally {
                callback(mainchain)
            }
        }
    },'{}')
}

function getTopBlock(fullchain,callback) {
    const genesis = '0000000000000000000000000000000000000000000000000000000000000000'
    // get the origin block
    // as there is nothing under it to be wrong
    for (var best in fullchain) {
        if (fullchain[best].parent === genesis) {
            break
        }
    }
    if (typeof best !== 'undefined' && fullchain[best].parent === genesis) {
        // iterates through the fullchain
        for (var key in fullchain) {
            // larger height the better
            if (fullchain[key].height > fullchain[best].height) {
                var candidate = true
                // iterate down the chain to see if you can reach the bottom
                // if the parent is undefined at any point it is not part of the main chain
                // run out of time for a more efficient method
                var current = key
                var parent
                while (fullchain[current].parent !== genesis) {
                    parent = fullchain[current].parent
                    if (typeof fullchain[parent] !== 'undefined') {
                        current = parent
                    } else {
                        candiate = false
                    }
                }
                if (candidate) {
                    best = key
                }
            // otherwise, if they're the same pick the oldest one
            } else if (fullchain[key].height === fullchain[best].height) {
                if (fullchain[key].time < fullchain[best].time) {
                    // see other comments
                    var candidate = true
                    var current = key
                    while (fullchain[current].parent !== genesis) {
                        parent = fullchain[current].parent
                        if (typeof fullchain[parent] !== 'undefined') {
                            current = parent
                        } else {
                            candiate = false
                        }
                    }
                    if (candidate) {
                        best = key
                    }
                }
            }
            document.getElementById('height').textContent = fullchain[best].height + 1
        }
    } else {
        best = null
    }
    callback(best)
}

exports.get = getBlock
exports.checkBalance = checkBalance
exports.calcBalances = calcBalances
exports.addBlock = addBlock
exports.getTopBlock = getTopBlock
exports.mainChain = mainChain
exports.getChain = getChain