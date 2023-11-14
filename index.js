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
    connectionLimit: 15,
    queueLimit: 0
})

app.disable("x-powered-by");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
    origin: [
        "https://localhost", // Production build
        "http://127.0.0.1:5500" // Development build
    ]
}));

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
                    connection.query("INSERT INTO users(username,email,password_hash,scores,prefrences) VALUES (?,?,?,?,?)", [req.body.username, req.body.email, hash, JSON.stringify({ type_easy: 0, type_med: 0, type_hard: 0, trace: 0 }), JSON.stringify({})], (errs, result) => {
                        connection.release()
                        if (errs) {
                            console.error('Error executing query:', error);
                            res.status(500).json({ error: 'Error executing query' });
                            return;
                        }
                        else {
                            const accestoken = jwt.sign({ username: req.body.username, email: req.body.email, password: hash }, process.env.server_secret_token)
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
        connection.query(`SELECT username,password_hash,scores,prefrences FROM users WHERE email = ?`, [req.body.email], (error, results, fields) => {
            connection.release()
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }

            if (results.length == 0) return res.status(403).json({ status: "exist", msg: "There is no account with this email. Would you prefer to signup instead" })

            bcrypt.compare(req.body.password, `${results[0].password_hash}`).then(result => {
                if (!result) return res.status(401).json({ status: "not valid", msg: "Email and password not match" })
                const accesstoken = jwt.sign({ username: results[0].username, email: req.body.email, password: results[0].password_hash }, process.env.server_secret_token)
                res.json({ status: "OK", token: accesstoken, scores: results[0].scores, config: results[0].prefrences })
            })
        })
    })
})

app.get("/api/account/detail", authentication, (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        console.log(req.user.email)

        connection.query("SELECT username,email,scores FROM users WHERE email = ?", req.user.email, (error, results, fields) => {
            connection.release()
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }

            res.json({ status: "OK", data: results[0] })
        })
    })
})

app.post("/api/account/update/username", authentication, (req, res, next) => {
    console.log(req.body)
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        connection.query(`SELECT * FROM users WHERE username = ?`, [req.body.username], (error, results, fields) => {
            connection.release()
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }


            if (results.length > 0) return res.json({ status: "exist", msg: `Someone already used ${req.body.username}` })
            console.log("not exist yet")

            console.log([req.body.username, req.user.email])

            connection.query(`UPDATE users SET username = ? WHERE email = ?`, [req.body.username, req.user.email], (errors, result) => {
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
    console.log(req.body)
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
                const newtoken = jwt.sign({ username: req.user.username, email: req.user.email, password: hashes }, process.env.server_secret_token)
                res.json({ status: "OK", msg: "Success update password", newtoken: newtoken })
            })
        })
    })
})

app.post("/api/account/config", authentication, (req, res) => {
    console.log(req.body)
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }
        connection.query("UPDATE users SET prefrences = ? WHERE email = ?", [JSON.stringify(req.body.config), req.user.email], (error, results) => {
            connection.release()
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }
            res.json({ status: "OK", msg: "Preferences succesfully updated" })
        })
    })
})

app.get("/api/account/config", authentication, (req, res) => {
    console.log(req.body)
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }
        connection.query("SELECT prefrences FROM users WHERE email = ?", [req.user.email], (error, results) => {
            connection.release()
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }
            console.log(results)
            res.json({ status: "OK", msg: "Foud your preferences", config: results[0].prefrences })
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

        connection.query(`UPDATE users SET scores = ? WHERE username = ?`, [JSON.stringify(req.body.data), req.user.username], (errs, results) => {
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
    let have_query = false;
    const game = {
        type_e: "type_easy",
        type_m: "type_med",
        type_h: "type_hard",
        trace: "trace"
    }
    if (req.query.game) {
        if (game[req.query.game] != undefined) have_query = true
    }
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        if (have_query) {
            console.log(req.query)
            const cast = `scores->'$.${game[req.query.game]}'`
            console.log(`SELECT username,scores FROM users ORDER BY ${cast} ${req.query.game == "trace" ? "ASC" : "DESC"} LIMIT 50`)
            connection.query(`SELECT username,scores FROM users ORDER BY ${cast} ${req.query.game == "trace" ? "ASC" : "DESC"} LIMIT 50`, (error, results) => {
                connection.release()

                if (error) {
                    console.error('Error executing query:', error);
                    res.status(500).json({ error: 'Error executing query' });
                    return;
                }
                console.log(results)

                res.json({ status: "OK", board: results })
            })
        } else {
            connection.query('SELECT username,scores FROM users', (error, results, fields) => {
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
        }
    })
})

app.get("/api/ping", authentication, (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL:', err);
            res.status(500).json({ error: 'Error connecting to the database' });
            return;
        }

        connection.query("SELECT scores,prefrences FROM users where email = ?", req.user.email, (error, results) => {
            connection.release()
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).json({ error: 'Error executing query' });
                return;
            }

            if (results.length > 0) {
                res.json({ status: "OK", config: results[0].prefrences, scores: results[0].scores })
            } else {
                res.json({ status: "Not Found", msg: "This account might be deleted" })
            }
        })
    })
})

app.use("*", (req, res) => {
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
