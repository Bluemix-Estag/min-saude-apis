
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
  res.setHeader('Content-Type','application/json');
  var username = req.body.username;
  var password = req.body.password;

  database.get('users', {
    revs_info:true
  }, function (err,doc){
    if(err){
      res.status(400).json({
        err,
        error: true,
        statusCode: 400,
        message: "Nao foi possivel encontrar o documento"
      })
    } else {
      var users = doc.users;
      var type;
      var foundUser = false;

      for(var user of users){
        if(user.login === username && user.senha === password){
          foundUser = true;
          res.status(200).json({
            message: "Authorized",
            error: false,
            page: user.type
          });
        }
      }
      if(!foundUser){
        res.status(512).json({
          message: "Not Authorized",
          error: true,
          statusCode: 512
        });
      }
    }
  })
});

app.post('/addWaiting', function(req, res){
  res.setHeader('Content-Type','application/json');
  var patient = req.body;
  database.get('waiting', {
    revs_info: true
  }, function (err, doc){
    if(err){
      res.status(400).json({
        err,
        error: true,
        statusCode: 400,
        message: "Nao foi possivel encontrar o documento"
      })
    } else {
      var patients = doc.patients;
      patients.push(patient);
      var rev = doc._rev;
      var newdoc = {
        patients,
        _rev: rev
      }
      database.insert(newdoc, 'waiting', function(err,doc){
        if(err){
          res.status(400).json({
            err,
            error: true,
            statusCode: 400,
            message: "Nao foi possivel adicionar a lista de espera"
          })
        }else{
          res.status(200).json({
            error: false,
            message: "Adicionado a lista de espera"
          });
        }
      })
    }
  });
});

app.get('/getWaiting', function(req, res){
  res.setHeader('Content-Type','application/json');
  database.get('waiting', {
    revs_info: true
  }, function(err,doc){
    if(err){
      res.status(400).json({
        err,
        error: true,
        statusCode: 400,
        message: "Nao foi possivel pegar a lista de espera"
      });
    } else {
      var patients = doc.patients;
      var unchecked = [];
      for(var patient of patients){
        if(patient.checked_in == false){
          unchecked.push(patient);
        }
      }
      if(unchecked.length == 0){
        res.status(404).json({
          error:true,
          statusCode: 404,
          message: "Lista de espera vazia"
        });
      } else {
        res.status(200).json({
          error: false,
          unchecked
        });
      }
    }
  })
});

app.get('/checkIn', function(req, res){
  res.setHeader('Content-Type','application/json');
  var susNumber = req.query.susNumber;
  database.get('waiting', {
    revs_info: true
  }, function (err,doc){
    if(err){
      res.status(400).json({
        err,
        error: true,
        statusCode: 400,
        message: "Nao foi possivel pegar a lista de espera"
      })
    } else {
      var patients = doc.patients;
      var found = false;
      for(var i in patients){
        if(patients[i].sus_number === susNumber){
          patients[i].checked_in = true;
          found = true;
          break;
        }
      }
      if(!found){
        res.status(404).json({
          error: true,
          statusCode: 404,
          message: "Nao foi possivel encontrar esse paciente"
        })
      } else {
        database.insert({
          patients,
          _rev: doc._rev
        }, 'waiting', function(err, doc){
          if(err){
            res.status(400).json({
              err,
              error: true,
              statusCode: 400,
              message: "Nao foi possivel mudar o status do paciente"
            });
          } else {
            res.status(200).json({
              error: false,
              message: "O status do paciente foi modificado"
            });
          }
        })
      }
    }
  })
})

http.createServer(app).listen(app.get('port'), '0.0.0.0', function () {
    console.log('Express server listening on port ' + app.get('port'));
});
