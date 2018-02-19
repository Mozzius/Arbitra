const network = require('../network.js')

function init() {
    // '85.255.237.191'
    var ip = 'localhost'
    var msg = {
        "header": {
            "type": "pg",
        },
        "body": {
            "advertise": true
        }
    }
    network.sendMsg(msg,ip)
}

exports.init = init