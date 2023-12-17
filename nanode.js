const express = require('express')
const dotenv = require('dotenv').config({override:true})

const session = require('express-session')
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const cors = require('cors')

const fs = require('fs')
const path = require('path');

const frontMatter = require('front-matter');
const markdown = require('markdown-it')(
    {
        html: true,
        linkify: true,
        typographer: true
    }
)

const _ = require('lodash');

const ejs = require('ejs');

const app = express()

function ready(appName = ''){
    
    // app.use(helmet())

    app.use(express.json({limit: '1mb'}));
    app.use(express.urlencoded({ extended: true }));
    app.use(bodyParser.json({ extended: true, limit: '5mb' }));

    if(appName !== '') {
        app.use(session({
            resave: false, // don't save session if unmodified
            saveUninitialized: false, // don't create session until something stored
            secret: 'nanode_' + appName,
            name: appName
        }));
    } else {
        app.use(session({
            resave: false, // don't save session if unmodified
            saveUninitialized: false, // don't create session until something stored
            secret: 'nanode',
        }));
    }

    app.use(fileUpload())

    app.use(express.static(process.cwd() + '/static'))

    app.enable('trust proxy');

    return app
}

function steady(){

    app.get('*', cors(), (req, res) => {
        defaultHandler(req,res)
    })

    app.post('*', cors(), (req, res) => {
        defaultHandler(req,res)
    })

    app.put('*', cors(), (req, res) => {
        defaultHandler(req,res)
    })

    app.patch('*', cors(), (req, res) => {
        defaultHandler(req,res)
    })

    app.delete('*', cors(), (req, res) => {
        defaultHandler(req,res)
    })

    app.options('*', cors())
}

function go(){
    if(process.env['PORT'] !== undefined) { var port = process.env['PORT'] } else { var port = 3000}
    app.listen(port, () => {
        console.log("=============================")
        console.log("=============================")
        console.log(`App listening on port ${port}`)
        console.log("=============================")
        console.log("=============================")
    })

    return app
}

function findDirectories(source) {
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(source, dirent.name))
        .sort((a, b) => parseInt(path.basename(a)) - parseInt(path.basename(b)))
}

function findFile(reqPath,filePath,extensions,canRecurse){
    var checkFile = ''
    var foundFile = ''

    if(reqPath == '/'){ reqPath = '/index'; }
    if(reqPath == ''){ reqPath = '/index' }

    for (const key in extensions) {
        if(foundFile == ''){
            const extension = extensions[key]
            checkFile = filePath + reqPath + '.' + extension
            console.log('Looking for ' + checkFile)
            if(fs.existsSync(checkFile)){
                foundFile = checkFile
            }
        }
    }

    // Did we find the file?
    if(foundFile !== ''){
        console.log('Found: ' + foundFile)
        return foundFile
    } else {
        if(reqPath == '/index'){
            // We have failed to find the file
            return false
        } else {
            // Try moving up one directory
            reqPath = reqPath.split('/')
            reqPath.pop()
            reqPath = reqPath.join('/')
            return findFile(reqPath,filePath,extensions,canRecurse)
        }
    }
}

async function defaultHandler(req,res){
    console.log('req.path: ' + req.path)

    const filePattern = /\.\w+$/; // This regex matches a dot followed by one or more word characters at the end of a string.
    if (filePattern.test(req.path)) {
        console.log('Blocking request for file')
        res.status(404).send('404 - File Not Found');
        return
    }

    // Find all the directories in our /content directory
    var directories = findDirectories(process.cwd() + '/content')

    // Set default objects and vars
    var page = {}
    var session = {} // TODO: Get a session from the req.
    var html = ''
    var stop = false

    // Loop through the directories and process each one
    for (const directoryI in directories) {
        if(!(stop === true)){
            const directory = directories[directoryI]
            console.log('Directory: ' + directory)
    
            // Find the file in this directory
            var contentFile = findFile(req.path,directory,['js','md','ejs','html','htm'],true,false)
    
            // Process the file
            if(!(contentFile === false)){
                console.log('Extension: ' + path.extname(contentFile))
                switch(path.extname(contentFile)){
                    case '.js':
                        stop = await jsHandler(req,res,contentFile,page,session)
                        if(stop === true) { console.log('Stop flag set')}
                        break
                    case '.md':
                        mdHandler(req,res,contentFile,page)
                        break
                    case '.ejs':
                        var html = html + await ejsHandler(req,res,contentFile,page,session,directory)
                        break
                    case '.html':
                    case '.htm':
                        var html = html + htmlHandler(contentFile)
                        break
                }
            }
        }

    }

    // All processing is now done. Time to look for output.
    if(res.finished === false || res.finished == undefined){
        if(html == ''){
            // Send output as JSON
            if(typeof page == 'object'){
                console.log('Sending JSON')
                res.setHeader('Content-Type', 'application/json');
                res.send(JSON.stringify(page,null,2))
            } else {
                console('Could not find ' + req.path)
                res.status(404).send('404 - Page Not Found');
            }
        } else {
            console.log('Sending HTML')
            res.header('Content-type', 'text/html')
            res.send(html)
        }
    } else {
        console.log('Finished:' + res.finished)
    }
    
    return
}

async function jsHandler(req,res,contentFile,page,session){
    delete require.cache[require.resolve(contentFile)]
    var route = require(contentFile)
    var verb = String(req.method).toLowerCase()
    var r = false 
    console.log('Looking for ' + verb)
    
    
    if(typeof route[verb] == 'function'){
        r = await route[verb](req,res,page,session)
    } else if(typeof route['go'] == 'function'){
        r = await route['go'](req,res,page,session)
    } else {
        return false
    }

    /*
    if(typeof page?.content == 'string' && page.html == undefined){
        page.html = markdown.render(page.content)
    }
    */

    return r
}

function mdHandler(req,res,contentFile,page){
    
    var contentFileContents = fs.readFileSync(contentFile,'utf8')
    
    const returnPage = frontMatter(contentFileContents)
    
    if(page.data == undefined) { page.data = {} }
    page.data = _.merge({},page.data,returnPage.attributes)
    
    if(page.html == undefined) { page.html = '' }
    page.html = page.html + markdown.render(returnPage.body)

}

function ejsHandler(req,res,themeFile,page,session,directory){
    themeFile = fs.readFileSync(themeFile,'utf8')
    try {
        var html = ejs.render(themeFile, 
            {
                'page': page,
                'req': req,
                'session': session,
            } ,
            {
            root: directory,
            // _with: false,
            localsName: 'data'
            }
        )    
    } catch (error) {
        console.log('EJS Error:' + error)
        var html = '<pre>' + error + '</pre>'
    }
    
    return html
}

function htmlHandler(themeFile){
    htmlFile = fs.readFileSync(themeFile,'utf8')
    return htmlFile
}

module.exports = { ready, steady, go }
