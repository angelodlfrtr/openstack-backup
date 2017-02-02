const pkgcloud = require('pkgcloud')
const fs       = require('fs')
const path     = require('path')
const exec     = require('child_process').exec
const _        = require('lodash')
const Promise  = require('bluebird')

module.exports = class OpenStackBackup {

  constructor(backup_path, name, options={}) {
    this.name        = name
    this.backup_path = path.resolve(backup_path)
    this.options     = this.parseOptions(options)

    this.checkOptions()
  }

  run() {
    let self = this

    if (self.options.verbose)
      console.log('-- Start backup for', self.backup_path)

    return new Promise(function(resolve, reject) {

      if (self.options.verbose)
        console.log('-- Creating archive...')

      self.createArhive().then(function(archive_path) {

        if (self.options.verbose)
          console.log('-- Archive created :', archive_path)

        let archive_size = fs.statSync(archive_path).size
        let downloaded   = 0;
        let client       = self.getOpenStackClient()
        let read_stream  = fs.createReadStream(archive_path)
        let write_stream = client.upload({
          container: self.options.openstack.container,
          remote: path.basename(archive_path)
        })

        write_stream.on('error', reject)

        if(self.options.verbose) {
          write_stream.on('data', function(d) {
            downloaded   += d.length;
            let percents = Math.round(downloaded * 100 / archive_size)
            process.stdout.write(`\r-- Downloading ${downloaded / 2} / ${archive_size} bytes -- ${percents / 2}%`)
          })
        }

        write_stream.on('success', function(file) {

          if (self.options.verbose) {
            console.log('\n-- Upload archive success')
            console.log('-- Removing previously created archive ...')
          }

          fs.unlink(archive_path, function(err) {
            if (err) return reject(err)

            if (self.options.verbose) {
              console.log('-- Archive removed')
              console.log('-- All done :) !')
            }

            resolve(file)
          })
        })

        if (self.options.verbose)
          console.log('-- Upload archive to', self.options.openstack.authUrl, `- ${archive_size} bytes`)

        read_stream.pipe(write_stream)
      }, reject)
    })
  }

  createArhive() {
    let self = this

    return new Promise(function(resolve, reject) {
      let archive_name = `${self.name}-${Math.floor(Date.now() / 1000)}.tar.gz`
      let archive_path = `${self.options.tmp_path}/${archive_name}`
      let command = [
        `cd ${path.dirname(self.backup_path)} &&`,
        'tar -zcvf',
        archive_path,
        path.basename(self.backup_path)
      ].join(' ')

      exec(command, function(err, stdout, stderr) {
        if (err) return reject(err)
        resolve(archive_path)
      })
    })
  }

  getOpenStackClient() {
    let args = {
      provider: 'openstack',
      username: this.options.openstack.username,
      password: this.options.openstack.password,
      authUrl:  this.options.openstack.authUrl
    }

    if (this.options.openstack.region)
      args.region = this.options.openstack.region

    return pkgcloud.storage.createClient(args)
  }

  checkOptions() {
    if (!this.options.openstack.username)
      throw 'Invalid openstack username'

    if (!this.options.openstack.password)
      throw 'Invalid openstack password'

    if (!this.options.openstack.authUrl)
      throw 'Invalid openstack authUrl'

    if (!this.options.openstack.container)
      throw 'Invalid openstack container'

    if (!this.options.tmp_path)
      throw 'Invalid tmp path'
  }

  parseOptions(options) {
    let base_opts = {
      tmp_path: '/tmp',
      verbose: false,
      openstack: {
        provider: 'openstack',
        username: process.env.OPENSTACK_USERNAME,
        password: process.env.OPENSTACK_PASSWORD,
        authUrl: process.env.OPENSTACK_AUTH_URL
      }
    }

    return _.merge(base_opts, options)
  }
}
