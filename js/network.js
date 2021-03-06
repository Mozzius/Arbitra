const net = require('net')
const hash = require('./hashing.js')
const file = require('./file.js')
const parse = require('./parse.js')
const version = require('../package.json').version
const blockchain = require('./blockchain.js')

const port = 2018

function init() {
    // creates a server that will receive all the messages
    // when it receives data, it will pass it to parseMsg()
    // and reply with whatever it sends back
    var server = net.createServer((socket) => {
        var ip = socket.remoteAddress
        socket.setEncoding('utf8')
        // when it receives data, send to parseMsg()
        socket.on('data',(data) => {
            console.log('Received connection from: '+ip)
            console.log('Server received: '+data)
            parseMsg(data,ip,(msg) => {
                if (msg.header.type !== 'tx' && msg.header.type !== 'bk') {
                    msg.body['time'] = Date.now()
                    msg.header['version'] = version
                    msg.header['size'] = Buffer.byteLength(JSON.stringify(msg.body))
                    msg.header['hash'] = hash.sha256hex(JSON.stringify(msg.body))
                }
                var reply = JSON.stringify(msg)
                console.info('Sending message to '+ip+': '+reply)
                socket.write(reply)
                file.append('sent',msg.header.hash)
                socket.end()
            })
        })
    })
    
    // server listens on this port
    // should be 2018
    server.listen(port,'0.0.0.0',() => {  
        console.log('Server listening on port',port)
    })

    // wipe connections
    // this will be populated with connections that succeed
    file.storeAll('connections',[])
    // inital connection attempt as setInterval runs at then end of the 60 seconds
    connect()
    
    try {
        blockchain.calcBalances()
    } catch(e) {
        console.warn('calcBalances() failed')
    }

    // this is a loop that maintains connections and
    // sends top hash requests to make sure the client is up to date
    // it goes on forever, every minute
    setInterval(() => {
        console.log('Interval')
        var connections = parseInt(document.getElementById('connections').textContent)
        // first check that we have enough connections
        file.get('target-connections','network-settings',(target) => {
            // if the current number of of connections is less than the minimum
            // as defined by user settings, connect
            if (connections < target) {
                connect()
                // if it's still not enough after 15 seconds, send node requests
                setTimeout(() => {
                    connections = parseInt(document.getElementById('connections').textContent)
                    if (connections < target) {
                        var nr = {
                            "header": {
                                "type": "nr"
                            },
                            "body": {}
                        }
                        sendToAll(nr)
                    }
                },15000)
            } else {
                // save current connections to recent connections
                file.getAll('connections',(data) => {
                    if (connections !== null) {
                        file.storeAll('recent-connections',JSON.parse(data))
                    }
                })
            }
            connections = parseInt(document.getElementById('connections').textContent)
            if (connections === 0) {
                document.getElementById('nonodes').classList.remove('hidden')
            } else {
                // check that the chain is up to date
                var hr = {
                    "header": {
                        "type": "hr"
                    },
                    "body": {}
                }
                sendToAll(hr)
            }
        },5) // if it fails to open the file it sets target to five
    },60000)
}

function connect() {
    // try to connect to other nodes through old connections
    file.getAll('recent-connections',(data) => {
        var connections = JSON.parse(data)
        file.get('advertise','network-settings',(data) => {
            if (data === 'true' || data === 'false') {
                var advertise = data
            } else {
                var advertise = 'true'
            }
            var ping = {
                "header": {
                    "type": "pg"
                },
                "body": {
                    "advertise": advertise
                }
            }
            file.getAll('connections',(curdata) => {
                var current = JSON.parse(curdata)
                connections.forEach((node) => {
                    if (!current.includes(node)) {
                        sendMsg(ping,node.ip)
                    }
                })
            },'[]')
            
            // wait ten seconds to see if any connections have been made
            setTimeout(() => {
                // get the number of connections from textContent
                var connectCount = parseInt(document.getElementById('connections').textContent)
                if (connectCount === 0) {
                    console.warn('No connections found!')
                    document.getElementById('nonodes').classList.remove('hidden')
                    console.warn('Connecting to backup server')
                    // wavecalcs.com is friend's server, and should be online for the purposes of this project
                    // wavecalcs.com = 5.81.186.90
                    sendMsg(ping,'5.81.186.90')
                }
            },10000)
        })
    },'[]')
}

function sendMsg(msg,ip,callback) {
    // for checking that the message hasn't already been sent
    file.getAll('sent',(data) => {
        // for some reason, sent.json sometimes ends with [...]]
        // until I find the source of the bug, this will do
        if (data[data.length-1] === data[data.length-2]) {
            data = data.slice(0,-1)
        }
        var sent = JSON.parse(data)
        if (msg.header.type !== 'bk' && msg.header.type !== 'tx') {
            // don't want to affect the body of a block
            // and the time of the tx is crucial as well
            // as it will throw off the hash
            msg.body['time'] = Date.now()
        }
        msg.header['version'] = version
        msg.header['size'] = Buffer.byteLength(JSON.stringify(msg.body))
        msg.header['hash'] = hash.sha256hex(JSON.stringify(msg.body))

        // check that the message hasn't already been sent
        if (!sent.includes(msg.header.hash)) {
            var sendMe = JSON.stringify(msg)
            console.info('Sending message to '+ip+': '+sendMe)

            // actually go send the message
            var client = new net.Socket()
            client.connect(port,ip,() => {
                client.write(sendMe)
                // add the hash to the sent messages file
                file.append('sent',msg.header.hash)
                client.on('data',(data) => {
                    console.log('Client received: '+data)
                    parseReply(data,ip,() => {
                        client.destroy()
                    })
                })
                client.on('close',() => {
                })
                client.on('timeout',() => {
                    console.warn('Client timed out')
                    client.destroy()
                })
                client.on('error',(e) => {
                    console.warn('Client timed out')
                    client.destroy()
                })
            })
        } else {
            console.log('Message already sent')
        }
    },'[]')
}

function parseMsg(data,ip,callback) {
    // parse incoming messages and replies
    // by calling parse functions
    try {
        var msg = JSON.parse(data)
        if (msg.header.hash === hash.sha256hex(JSON.stringify(msg.body))) {
            if (msg.header.type === 'tx') {
                // transaction
                // callback is used to send the reply
                parse.tx(msg,callback)
            } else if (msg.header.type === 'bk') {
                // block
                parse.bk(msg,callback)
            } else if (msg.header.type === 'hr') {
                // hash request
                parse.hr(msg,callback)
            } else if (msg.header.type === 'cr') {
                // chain request
                parse.cr(msg,callback)
            } else if (msg.header.type === 'pg') {
                // ping
                parse.pg(msg,ip,callback)
            } else if (msg.header.type === 'nr',callback) {
                // node request
                parse.nr(msg,ip,callback)
            } else {
                throw 'type'
            }
        } else {
            throw 'hash'
        }
    } catch(e) {
        // catching any errors and replying with an error message
        console.warn(e)
        var error
        if (e.name === 'SyntaxError') {
            error =  'parse'
        } else {
            error = e
        }
        var reply = {
            "header": {
                "type": "er"
            },
            "body": {
                "error": error
            }
        }
        file.append('error-logs',data)
        callback(reply)
    }
}

function parseReply(data,ip,callback=()=>{}) {
    // parse incoming replies
    // by calling parse functions
    try {
        var msg = JSON.parse(data)
        if (msg.header.hash == hash.sha256hex(JSON.stringify(msg.body))) {
            if (msg.header.type === 'cn') {
                // chain
                parse.cn(msg)
            } else if (msg.header.type === 'bh') {
                // top hash
                parse.bh(msg)
            } else if (msg.header.type === 'nd') {
                // nodes
                parse.nd(msg)
            } else if (msg.header.type === 'pg') {
                // ping
                parse.pgreply(msg,ip)
            } else if (msg.header.type === 'ok') {
                // message received ok
                console.info('message recieved ok')
            } else if (msg.header.type === 'er') {
                // error (uh oh)
                console.warn('We recieved an error')
                parse.er(msg)
            } else {
                throw 'type'
            }

        } else {
            throw 'hash'
        }
    } catch(e) {
        console.warn('Reply error: '+e)
        file.append('error-log',msg)
    } finally {
        // call the callback, if needed
        callback()
    }
}

function sendToAll(msg) {
    file.getAll('connections',(data) => {
        // doesn't do anything if there's no connections
        if (data !== null || data === '' || data === '[]') {
            nodes = JSON.parse(data)
            // go through connections and send a message to each
            nodes.forEach((node) => {
                sendMsg(msg,node.ip)
            })
        }
    })
}

exports.init = init
exports.sendMsg = sendMsg
exports.sendToAll = sendToAll
exports.connect = connect