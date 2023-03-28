const express = require('express');
const app = express();
const bodyParser = require('body-parser');              //using body-parser to get the request body
app.use(bodyParser.json());
const port = 4000;

//datastore implementation
const datastore = {};
const blockingQueue = {};
//set command implementation
function setCommand(key, value, expiry, condition) {
    console.log(key, value, expiry, condition)
    if (condition === 'NX' && datastore[key]) {         //NX -- Only set the key if it does not already exist.
        return { error: 'Key already exists' };
    }
    if (condition === 'XX' && !datastore[key]) {       //XX -- Only set the key if it already exists.
        return { error: 'Key does not exist' };
    }
    datastore[key] = value;                             //default behavior
    if (expiry) {
        setTimeout(() => {                              //setting timeout for expiry of key
            delete datastore[key];
        }, expiry * 1000);
    }
    return { value };
}

//get command implementation
function getCommand(key) {                            //function to get the value from the store
    const value = datastore[key];
    if (value) {
        return { value };
    } else {
        return { error: 'Key not found' };
    }
}

//qpush command implementation
function qpushCommand(key, ...values) {              //function to push single/multiple elements to queue
    delete blockingQueue[key];
    if (!datastore[key]) {
        datastore[key] = [];
    }
    datastore[key].push(...values);
}

//qpop command implementation
function qpopCommand(key) {                            //function to pop elements from the queue
    if (!datastore[key]) {
        return { error: 'Key not found' };
    }
    else if (datastore[key].length === 0) {
        return { error: 'Queue is empty' };
    }
    return { value: datastore[key].pop() };               //popping last element from datastore queue
}

//bqpop command implementation

function bqpopCommand(key, timeout, callback) {
    if (!datastore[key]) {
        return { error: 'Key not found' };
    }
    if (datastore[key].length > 0) {
        setTimeout(() => {                                 //popping data after some timeout
            callback({ value: datastore[key].pop() });
        }, timeout * 1000);
    } else {
        const timeoutId = setTimeout(() => {              //blocking queue for timeout if no element is present
            delete blockingQueue[key];
            callback({ error: 'Timeout' });
        }, timeout * 1000);
        blockingQueue[key] = { timeoutId };
    }
}

//controller
app.post('/command', (req, res) => {
    try {
        console.log(datastore)
        const command = req.body.command.trim().split(' ');
        if (command.length === 0) {
            res.json({ error: 'Invalid command' });
            return;
        }
        let operation = command[0];
        let key = command[1];
        let value = command[2];
        let isExpiry = command[3]
        let expiry = command[4] && isExpiry.startsWith('EX') ? parseInt(command[4]) : undefined;
        let condition = command[5];

        if (command.length == 4) {
            condition = command[3]
        }

        let result;
        switch (operation) {                  //switching based on first value in input string
            case 'SET':
                result = setCommand(key, value, expiry, condition);
                break;
            case 'GET':
                result = getCommand(key);
                break;
            case 'QPUSH':
                qpushCommand(key, ...command.slice(2));
                result = {};
                break;
            case 'QPOP':
                result = qpopCommand(key);
                break;
            case 'BQPOP':
                bqpopCommand(key, parseInt(command[2]), (result) => {
                    res.json(result);
                });
                return;
            default:
                result = { error: 'Invalid command' };
        }

        res.json(result);
        return;
    }
    catch (ex) {
        console.log(ex);
        res.json({ message: "Something went wrong" })
    }
});

app.listen(port, () => {
    console.log(`Server is working on port: ${port}`);             //starting server
})

