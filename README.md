# Ministerio da Saude - Login e Lista de Espera
* /login **(POST)**
_req_:
```json
{
  "username": "Abcde",
  "password": "1234"
}
```
* /addWaiting **(POST)**
_req_:
```json
{
  "name": "Abcde",
  "sus_number": "123456",
}
```
* /getWaiting **(GET)**

* /checkIn **(POST)**
_req_:
```json
{
  "priority": "2",
  "info": {
    "queixa": "abdsjl",
    "temperatura": "76",
    "etc ..."
  }
}
```

* /getDoctorList **(GET)**

* /removeDoctorList **(GET)**
_query_: `?susNumber=12345`

### Priority
* 3 = imediato
* 2 = prioritario
* 1 = no dia
