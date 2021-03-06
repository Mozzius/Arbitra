const file = require('../file.js')
const version = require('../../package.json').version
const fs = require('fs')
const network = require('../network.js')
const dialog = require('electron').remote.dialog

function init() {
    document.getElementById('version').textContent = version

    document.getElementById('save').addEventListener('click',() => {
        file.getAll('wallets',(data) => {
            dialog.showSaveDialog({
                    filters: [
                        {name:'JSON',extensions:['json']},
                        {name:'All files',extensions:['*']}
                    ]
                },(file) => {
                fs.writeFile(file,data,(err) => {
                    if (err) throw err
                })
            })
        })
    })

    document.getElementById('clear').addEventListener('click',() => {
        file.storeAll('blockchain',{})
        file.storeAll('balances',{})
        file.storeAll('connections',[])
        file.storeAll('network-settings',{"advertise":"true","target-connections":5})
        file.storeAll('recent-connections',[])
        file.storeAll('txpool',[])
        file.storeAll('recenttx',[])
        file.storeAll('sent',[])
        file.storeAll('error-log',[])
        document.getElementById('ca-save').classList.remove('hidden')
        document.getElementById('connections').textContent = 0
        document.getElementById('height').textContent = 0
        console.warn('All files wiped')
        network.connect(false)
    })
}

exports.init = init