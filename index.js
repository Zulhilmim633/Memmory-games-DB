const express = require("express")
const cors = require("cors");
const mysql = require("mysql2")
const bodyParser = require("body-parser")
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const app = express()
require("dotenv").config()

let not_configure = false

if (process.env.server_secret_token == null) {
    console.log('Please set the server_secret_token in your .env file')
    not_configure = true
}
if (process.env.db_pass == null) {
    console.log('Please set the db_pass in your .env file')
    not_configure = true
}
if (not_configure) process.exit(0)

const port = process.env.port || 3000
const host = process.env.host || "localhost"
const pool = mysql.createPool({
    host: "192.168.1.2",
    user: "remote",
    password: process.env.db_pass,
    database: "memmory_apps",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})

app.disable("x-powered-by");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({ origin: [
    "https://localhost", // Production build
    "http://127.0.0.1:5500" // Development build
] }));

app.post("/api/account/register", (req, res) => {
    console.log(req.body)
    var check_email = req.query.check != undefined ? req.query.check : null
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        // Perform a query
        connection.query('SELECT * FROM users', (error, results, fields) => {
            // Release the connection
            connection.release();

            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }

            // Send the query results as a JSON response
            for (let users of results) {
                if (users.email == req.body.email) return res.json({ status: "Exist", msg: `Email ${req.body.email} already be used, try to login instead` })
            }

            if (check_email == "email") return res.json({ status: "OK", msg: "This email can be used" })

            bcrypt.hash(req.body.password, 10)
                .then(hash => {
                    connection.query("INSERT INTO users(username,email,password_hash) VALUES (?,?,?)", [req.body.username, req.body.email, hash], (errs, result) => {
                        connection.release()
                        if (errs) {
                            console.error('Error executing query:', error);
                            res.status(500).json({ error: 'Error executing query' });
                            return;
                        }
                        else {
                            const accestoken = jwt.sign({ email: req.body.email, password: hash }, process.env.server_secret_token)
                            connection.query("INSERT INTO scoreboard(username,scores) VALUES (?,?)",[req.body.username,JSON.stringify({})],(err,resu)=>{
                                connection.release()
                                if (err) {
                                    console.error('Error executing query:', error);
                                    res.status(500).json({ error: 'Error executing query' });
                                    return;
                                }
                            })
                            return res.status(201).json({ status: "OK", msg: "User create", token: accestoken })
                        }
                    })
                })
        })
    })
})

app.post("/api/account/login", (req, res) => {
    console.log(req.body)
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }
        connection.query(`SELECT password_hash FROM users WHERE email = ?`, [req.body.email], (error, results, fields) => {
            connection.release()
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }

            if (results.length == 0) return res.status(403).json({ status: "not valid", msg: "There is no account with this email !! Would you prefer to signup instead" })

            bcrypt.compare(req.body.password, `${results[0].password_hash}`).then(result => {
                if (!result) return res.status(401).json({ status: "not valid", msg: "Email and password not match" })
                const accesstoken = jwt.sign({ email: req.body.email, password: results[0] }, process.env.server_secret_token)
                res.json({ status: "OK", token: accesstoken })
            })
        })
    })
})

app.get("/api/account/detail",authentication,(req,res)=>{
    pool.getConnection((err,connection)=>{
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        connection.query("SELECT username,email FROM users WHERE email = ?", req.user.email, (error, results, fields) => {
            if(error){
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }

            res.json({status:"OK",data:results[0]})
        })
    })
})

app.post("/api/account/update/username", authentication, (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        connection.query(`SELECT * FROM users WHERE username = ?`, [req.body.username], (error, results, fields) => {
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }


            if (results.length > 0) return res.json({ status: "exist", msg: `Someone already used ${req.body.username}` })

            connection.query(`UPDATE users SET username = ? WHERE email = ?`, [req.body.username, req.user.email], (errors, result, fields) => {
                connection.release()
                if (errors) {
                    console.error('Error executing query:', error);
                    res.status(500).json({ error: 'Error executing query' });
                    return;
                }
                res.json({ status: "OK", msg: "Username has been change" })
            })
        })
    })
})

app.post("/api/account/password/update", authentication, (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        bcrypt.hash(req.body.new_password, 10).then(hashes => {
            connection.query("UPDATE users SET password_hash = ? WHERE email = ?", [hashes, req.user.email], (error, results) => {
                connection.release()
                if (error) {
                    console.error('Error executing query:', error);
                    res.status(500).json({ error: 'Error executing query' });
                    return;
                }
                const newtoken = jwt.sign({ email: req.user.email, password: hashes }, process.env.server_secret_token)
                res.json({ status: "OK", msg: "Success update password", newtoken: newtoken })
            })
        })
    })
})

app.post("/api/leaderboard/update", authentication, (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        connection.query(`UPDATE scoreboard SET scores = ? WHERE username = ?`, [JSON.stringify(req.body.data), req.body.username], (errs, results) => {
            connection.release()
            if (errs) {
                console.error('Error executing query:', errs);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }
            res.json({ status: "OK", msg: "Scores update" })
        })
    })
})

app.get("/api/leaderboard", (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        // Perform a query
        connection.query('SELECT * FROM scoreboard', (error, results, fields) => {
            // Release the connection
            connection.release();

            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }

            // Send the query results as a JSON response
            res.json(results);
        })
    })
})

app.use("*",(req,res)=>{
    res.sendStatus(403)
})

function authentication(req, res, next) {
    const auth_header = req.headers['authorization']
    const token = auth_header && auth_header.split(" ")[1]
    if (token == null) return res.status(401).json({ status: "Not valid", msg: "No api token detected" })
    jwt.verify(token, process.env.server_secret_token, (err, user) => {
        if (err) return res.status(401).json({ status: "Not valid", msg: "Unauthorized access" })
        req.user = user
        next()
    })
}

app.listen(port, host, () => {
    console.log(`Server is running on port http://${host}:${port}`);
});
