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

* /checkIn **(GET)**
_query_: `?susNumber=123456`
