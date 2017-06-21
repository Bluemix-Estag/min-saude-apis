
var express = require('express');
var cfenv = require('cfenv');
var cloudant = require('cloudant');
var fs = require('fs');
var http = require('http');
var bodyParser = require('body-parser');
var moment = require('moment');
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
        error: true,
        statusCode: 400,
        message: "Nao foi possivel encontrar o documento"
      });
    } else {
      var users = doc.users;
      var type;
      var found = false;

      for(var user of users){
        if(user.login === username && user.senha === password){
          found = true;
          res.status(200).json({
            message: "Authorized",
            error: false,
            page: user.type
          });
        }
      }
      if(!found){
        res.status(512).json({
          message: "Not Authorized",
          error: true,
          statusCode: 512
        });
      }
    }
  });
});

app.post('/addWaiting', function(req, res){
  res.setHeader('Content-Type','application/json');
  var patient = req.body;
  if((patient.name == null || patient.name == "") || (patient.sus_number == null || patient.sus_number == "")){
    res.status(400).json({
      error: true,
      statusCode: 400,
      message: "Bad Request"
    });
  } else {
  // if(patient.checked_in == null){
  //   patient.checked_in = false;
  // }
  database.get('waiting', {
    revs_info: true
  }, function (err, doc){
    if(err){
      res.status(400).json({
        error: true,
        statusCode: 400,
        message: "Nao foi possivel encontrar o documento"
      });
    } else {
      var patients = doc.patients;
      var found = false;
      for(var i of patients){
        if(i.sus_number === patient.sus_number){
          found = true;
          break;
        }
      }
      if(!found){
        patient.arrival = moment().unix();
        patients.push(patient);
        doc.patients = patients;
        database.insert(doc, 'waiting', function(err,doc){
          if(err){
            res.status(400).json({
              error: true,
              statusCode: 400,
              message: "Nao foi possivel adicionar a lista de espera"
            });
          } else {
            res.status(200).json({
              error: false,
              message: "Adicionado a lista de espera"
            });
          }
        });
      } else {
        res.status(400).json({
          error: true,
          statusCode: 400,
          message: "Paciente ja esta na lista de espera"
        });
      }
    }
  });
}
});

app.get('/getWaiting', function(req, res){
  res.setHeader('Content-Type','application/json');
  database.get('waiting', {
    revs_info: true
  }, function(err,doc){
    if(err){
      res.status(400).json({
        error: true,
        statusCode: 400,
        message: "Nao foi possivel pegar a lista de espera"
      });
    } else {
      // var patients = doc.patients;
      // var unchecked = [];
      // for(var patient of patients){
      //   if(patient.checked_in == false){
      //     unchecked.push(patient);
      //   }
      // }
      if(doc.patients.length == 0){
        res.status(404).json({
          error:true,
          statusCode: 404,
          message: "Lista de espera vazia"
        });
      } else {
        var patients = doc.patients
        res.status(200).json({
          error: false,
          patients
        });
      }
    }
  });
});

app.post('/checkIn', function(req, res){
  res.setHeader('Content-Type','application/json');
  var priority = req.body.priority;
  var info =  req.body.info;
  if(priority == null || priority == ""){
    priority = "1";
  }
  database.get('waiting', {
    revs_info: true
  }, function (err,doc){
    if(err){
      res.status(400).json({
        error: true,
        statusCode: 400,
        message: "Nao foi possivel pegar a lista de espera"
      });
    } else {
      if(doc.patients.length != 0){
        var patients = doc.patients;
        var patient = patients.shift();
        patient.info = info;
        patient.priority = priority;
        patient.checked_in = moment().unix();
        var originalrev = doc._rev;
        database.get('doctorList', {
          revs_info:true
        }, function(err,doc){
          if(err){
            res.status(400).json({
              error: true,
              statusCode: 400,
              message: "Nao foi possivel pegar a lista do medico"
            });
          } else {
            var found = false;
            for(var i of doc.prioritario){
              if(i.sus_number === patient.sus_number){
                found = true;
                break;
              }
            }
            if(!found){
              for(var i of doc.imediato){
                if(i.sus_number === patient.sus_number){
                  found = true;
                  break;
                }
              }
            }
            if(!found){
              for(var i of doc.dia){
                if(i.sus_number === patient.sus_number){
                  found = true;
                  break;
                }
              }
            }
            if(!found){
            switch(priority){
              case '3':
                doc.imediato.push(patient);
                break;
              case '2':
                doc.prioritario.push(patient);
                break;
              case '1':
                doc.dia.push(patient);
                break;
          }
          database.insert(doc, 'doctorList', function(err,doc){
            if(err){
              res.status(400).json({
                error: true,
                statusCode: 400,
                message: "Nao foi possivel adicionar na lista do medico"
              });
            } else {
              database.insert({
                  patients,
                  _rev: originalrev
                }, 'waiting', function(err, doc){
                  if(err){
                      res.status(400).json({
                        err,
                        error: true,
                        statusCode: 400,
                        message: "Nao foi possivel retirar o paciente da lista"
                      });
                  } else {
                      res.status(200).json({
                        error: false,
                        message: "O status do paciente foi modificado"
                      });
                    }
                });
            }
          });
        } else {
          database.insert({
              patients,
              _rev: originalrev
            }, 'waiting', function(err, doc){
              if(err){
                  res.status(400).json({
                    err,
                    error: true,
                    statusCode: 400,
                    message: "Nao foi possivel retirar o paciente da lista"
                  });
              } else {
                  res.status(200).json({
                    error: false,
                    message: "Paciente ja esta na lista do medico"
                  });
                }
            });
        }
        }
      });

    } else {
        res.status(404).json({
          error: true,
          message: "Lista vazia"
        })
      }
    }
  });
});

app.get('/getDoctorList', function(req, res){
  res.setHeader('Content-Type','application/json');
  database.get('doctorList', {
    revs_info: true
  }, function(err,doc){
    if(err){
      res.status(400).json({
        error: true,
        statusCode: 400,
        message: "Nao foi possivel pegar a lista de espera"
      });
    } else {
      if(doc.prioritario.length == 0 && doc.imediato.length == 0 && doc.dia.length == 0){
        res.status(404).json({
          error:true,
          statusCode: 404,
          message: "Lista de espera vazia"
        });
      } else {
        var prioritario = doc.prioritario;
        var imediato = doc.imediato;
        var dia = doc.dia;
        res.status(200).json({
          error: false,
          prioritario,
          imediato,
          dia
        });
      }
    }
  });
});

app.get('/removeDoctorList', function(req, res){
  res.setHeader('Content-Type','application/json');
  database.get('doctorList',{
    revs_info: true
  }, function(err, doc){
    if(err){
      res.status(400).json({
        error: true,
        statusCode: 400,
        message: "Nao foi possivel pegar a lista do medico"
      });
    } else {
      var ok = true;
      if(doc.imediato.length != 0){
        doc.imediato.shift();
      } else {
        if(doc.prioritario.length != 0){
          doc.prioritario.shift();
        } else {
          if(doc.dia.length != 0){
            doc.dia.shift();
          } else {
            ok = false;
            res.status(400).json({
              error: true,
              statusCode: 400,
              message: "Lista esta vazia"
            });
          }
        }
      }
      if(ok){
        database.insert(doc, 'doctorList', function(err, doc){
          if(err){
            res.status(400).json({
              error: true,
              statusCode: 400,
              message: "Nao foi possivel retirar da lista do medico"
            });
          } else {
            res.status(200).json({
              error: false,
              statusCode: 200,
              message: "Paciente retirado"
            });
          }
        });
      }
    }
  });
});

http.createServer(app).listen(app.get('port'), '0.0.0.0', function () {
    console.log('Express server listening on port ' + app.get('port'));
});
