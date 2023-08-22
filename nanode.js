const express = require('express')
const dotenv = require('dotenv').config({override:true})

const session = require('express-session')
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const cors = require('cors')

const fs = require('fs')
const path = require('path');

const gmatter = require('gray-matter')
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

function findFile(reqPath,filePath,extensions,canRecurse,rootIs404){
    var checkFile = ''
    var foundFile = ''

    if(reqPath == '/'){ reqPath = '/index'; }
    if(reqPath == ''){ reqPath = '/index' }

    if(reqPath == '/index' && rootIs404){
        console.log(404)
        return false
    }

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
        if(reqPath == '/index' || canRecurse == false){
            // We have failed to find the file
            console.log('404')
            return false
        } else {
            // Try moving up one directory
            reqPath = reqPath.split('/')
            reqPath.pop()
            reqPath.join('/')
            return findFile(reqPath,filePath,extensions,canRecurse)
        }
    }
}

async function defaultHandler(req,res){
    console.log('req.path: ' + req.path)

    // Find all the directories in our /content directory
    var directories = findDirectories(process.cwd() + '/content')

    // Set default objects and vars
    var page = {}
    var session = {} // TODO: Get a session from the req.
    var html = ''

    // Loop through the directories and process each one
    for (const directoryI in directories) {
        const directory = directories[directoryI]
        console.log('Directory: ' + directory)

        // Find the file in this directory
        var contentFile = findFile(req.path,directory,['js','md','ejs'],true,false)

        // If we return a false, treat this as a 404
        /*
        if(contentFile === false){
            res.status(404).send('404 - Not Found');
            return
        }
        */

        // Process the file
        if(!(contentFile === false)){
            console.log('Extension: ' + path.extname(contentFile))
            switch(path.extname(contentFile)){
                case '.js':
                    await jsHandler(req,res,contentFile,page,session)
                    break
                case '.md':
                    await mdHandler(req,res,contentFile,page)
                    break
                case '.ejs':
                    var html = html + await ejsHander(req,res,contentFile,page,session,directory)
            }
        }

    }

    // All processing is now done. Time to look for output.
    if(res.finished === false || res.finished == undefined){
        if(html == ''){
            // Send output as JSON
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(page,null,2))
        } else {
            res.header('Content-type', 'text/html')
            res.send(html)
        }
    }
    
}

async function defaultHander_OLD(req,res) {  
    console.log('req.path: ' + req.path)

    // Find our content file
    if(req.path == '/'){
        var contentFile = findFile(req.path,'/content',['js','md'],false,false)
    } else {
        var contentFile = findFile(req.path,'/content',['js','md'],true,true)
    }
    
    // If there is no file, return a 404
    if(contentFile === false){
        res.status(404).send('404 - Not Found');
        return
    }

    // Process the file
    console.log('Extension: ' + path.extname(contentFile))
    switch(path.extname(contentFile)){
        case '.js':
            var page = await jsHandler(req,res,contentFile)
            break
        case '.md':
            var page = await mdHandler(req,res,contentFile)
            console.log(page)
            break
    }
    // Return 404 if the return from the process is false
    if(page === false){
        res.status(404).send('404 - Not Found');
        return
    }

    // Pass the return through any hooks that have been registered
    if(typeof page == 'object' && hooks.page.length > 0){
        for (let index = 0; index < hooks.page.length; index++) {
            const hookfunc = array[index];
            page = await hookfunc(req,res,page)
        }
    }

    // Check the return
    if(typeof page == 'object'){
        // A returned object needs to be parsed through a template
        console.log('Going for theme')
        const themeFile = findFile(req.path,'/theme',['ejs','html'],true,false)
        if(themeFile === false){
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(page,null,2))
        } else {
            var html = await themeHander(req,res,themeFile,page)
            res.header('Content-type', 'text/html')
            res.send(html)
        }
    } else {
        res.status(404).send('404 - Not Found');
        return
    }

    return 
}

async function jsHandler(req,res,contentFile,page,session){
    delete require.cache[require.resolve(contentFile)]
    var route = require(contentFile)
    var verb = String(req.method).toLowerCase()
    console.log('Looking for ' + verb)
    if(typeof route[verb] == 'function'){
        await route[verb](req,res,page,session)
    } else if(typeof route['go'] == 'function'){
        await route['go'](req,res,page,session)
    } else {
        return false
    }

    if(typeof page?.content == 'string' && page.html == undefined){
        page.html = markdown.render(page.content)
    }
    return page
}

async function mdHandler(req,res,contentFile,page){
    
    console.log('Parsing for YAML and markdown: ' + contentFile)
    
    var contentFileContents = fs.readFileSync(contentFile)
    var returnPage = gmatter(contentFileContents)
    returnPage.html = markdown.render(returnPage.content);

    if(page.data == undefined) { page.data = {} }
    page.data = _.merge({},page.data,returnPage.data)
    page.html = page.html + returnPage.html

    delete returnPage.html
    delete returnPage.data
    delete returnPage.orig

    page = _.merge({},page,returnPage)
}

async function ejsHander(req,res,themeFile,page,session,directory){
    console.log('In theme handler')
    themeFile = fs.readFileSync(themeFile,'utf8')
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
    return html
}

module.exports = { ready, steady, go }
