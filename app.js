
var express = require('express');
var cfenv = require('cfenv');
var cloudant = require('cloudant');
var fs = require('fs');
var http = require('http');
var bodyParser = require('body-parser')
// create a new express server
var app = express();

// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));

// load local VCAP configuration
var vcapLocal = null;
var appEnvOpts = {};

// Add headers
app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});

app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.set('port', process.env.PORT || 3000);

fs.stat('./vcap-local.json', function (err, stat) {
    if (err && err.code === 'ENOENT') {
        // file does not exist
        console.log('No vcap-local.json');
        initializeAppEnv();
    } else if (err) {
        console.log('Error retrieving local vcap: ', err.code);
    } else {
        vcapLocal = require("./vcap-local.json");
        console.log("Loaded local VCAP", vcapLocal);
        appEnvOpts = {
            vcap: vcapLocal
        };
        initializeAppEnv();
    }
});


// get the app environment from Cloud Foundry, defaulting to local VCAP
function initializeAppEnv() {
    appEnv = cfenv.getAppEnv(appEnvOpts);
    if (appEnv.isLocal) {
        require('dotenv').load();
    }
    if (appEnv.services.cloudantNoSQLDB) {
        initCloudant();
    } else {
        console.error("No Cloudant service exists.");
    }
}

// =====================================
// CLOUDANT SETUP ======================
// =====================================
var dbname = "my_db";
var database;

function initCloudant() {
    var cloudantURL = appEnv.services.cloudantNoSQLDB[0].credentials.url || appEnv.getServiceCreds("Cloudant NoSQL DB-eg").url;
    var Cloudant = require('cloudant')({
        url: cloudantURL,
        plugin: 'retry',
        retryAttempts: 10,
        retryTimeout: 500
    });
    // Create the accounts Logs if it doesn't exist
    Cloudant.db.create(dbname, function (err, body) {
        if (err && err.statusCode == 412) {
            console.log("Database already exists: ", dbname);
        } else if (!err) {
            console.log("New database created: ", dbname);
        } else {
            console.log('Cannot create database!');
        }
    });
    database = Cloudant.db.use(dbname);
    // Create/check the document existance
    database.get('users', {
        revs_info: true
    }, function (err, doc) {
        if (err) {
            console.log('Users nao existe');
            database.insert({
                users: [
                  {
                    name: "Joao da Silva",
                    type: "doutor",
                    login: "joaods",
                    senha: "1234"
                  },
                  {
                    name: "Gabriel de Mira",
                    type: "atendente",
                    login: "gabrielm",
                    senha: "123quatro"
                  },
                  {
                    name: "Maria",
                    type: "triagem",
                    login: "maria",
                    senha: "12345"
                  }
                ]
            }, 'users', function (err, doc) {
                if (!err) {
                    console.log('Users criado');
                } else {
                    console.log(err);
                }
            });
        } else {
            console.log('Users existe');
        }
    });
}

app.post('/login', function(req,res){
  var username = req.body.username;
  var password = req.body.password;

  database.get('users', {
    revs_info:true
  },function(err,doc){
    if(err){
      console.log(err);
    }else{
      var users = doc.users;
      var type;
      var foundUser = false;

      for(var user of users){
        if(user.login === username && user.senha === password){
          foundUser = true;
          res.status(200).json({
            message: "Authorized",
            status: true,
            page: user.type
          });
        }
      }
      if(!foundUser){
        res.status(512).json({
          message: "Not Authorized",
          status: false
        });
      }
    }
  })
});

http.createServer(app).listen(app.get('port'), '0.0.0.0', function () {
    console.log('Express server listening on port ' + app.get('port'));
});
