/**
 * Created by zvi on 8/8/2016.
 */
var express = require('express');

var app = express();
var requestIp = require('request-ip');
var firebase = require('firebase');
var multer  = require('multer');
var upload = multer({ dest: 'uploads/' });
var fs = require('fs');
const PORT = 9450;
firebase.initializeApp({
    serviceAccount: "./Weedle-69d94723eed7.json",
    databaseURL: "https://weedle-27e37.firebaseio.com",
    databaseAuthVariableOverride: {
        uid: "server_worker_1"
    }
});
var db = firebase.database();
//start the node server
app.set('port', process.env.PORT || PORT);

app.get('/' ,function (req,res) {
    var clientIp = requestIp.getClientIp(req);
    res.send('frillappss\' server\nWhere all good things start.' + "\nYour ip: +" + clientIp);
});
app.listen(app.get('port'),function(){
    console.log('server started on port itzik '+ app.get('port'));
});

// get winner social image file
app.post('/file_upload', upload.single('png'), function (req, res, next) {
    console.log('image file received!');
});











var currentRunningGame = 0;
 pushNewGame(1);
function pushNewGame(gameNum){

    currentRunningGame++;
    var gamesPresetsRef = db.ref("gamePresets/game"+currentRunningGame);
    // Attach an asynchronous callback to read the data at our posts reference
    console.log("game"+currentRunningGame);
    gamesPresetsRef.once("value", function(snapshot) {
        console.log(snapshot.val());
        //set the current game to fb db
        var gameObj = snapshot.val();
        var minutesDelay = gameObj.minutesDelay;
        var gameRef = db.ref("games/game"+gameNum);
        gameRef.update({
            "backgroundUrl": gameObj.backgroundUrl,
            "gameSize": gameObj.gameSize,
            "prizeImgUrl": gameObj.prizeImgUrl,
            "prizeName": gameObj.prizeName,
            "startTimeMillis": calcNextGameStartTimeMillis(minutesDelay)
        });
        //start timer for game start
        startGameTimer(minutesDelay,gameRef);
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
        //if failed, call it again after reset currentRunnigGame
        currentRunningGame = 0;
        pushNewGame(gameNum)
    });

};

function startGameTimer (minutes, gameRef) {
    console.log("timer start: " +minutes);
    setTimeout(gameRef.update({
        "gameRunning": true,
        "winnerWon": false,
        "winner": null,
        "medianBarPercent": 0
    }), minutes*60*1000);
};

function calcNextGameStartTimeMillis (minutes) {
    console.log("minutes: " + minutes);
    var d = new Date();
    var currentMillis = d.getTime();
    console.log("current millis: " + currentMillis);
    var timeMillis = currentMillis+(minutes*60*1000);
    console.log("results millis: " + timeMillis);
    return timeMillis;

};











/*
//retreive data from db + listen to changes to ref
var ref = db.ref("itzik/pantsColor");
// Attach an asynchronous callback to read the data at our posts reference
ref.on("value", function(snapshot) {
    console.log(snapshot.val());
}, function (errorObject) {
    console.log("The read failed: " + errorObject.code);
});*/



/*

//update data
ref.update({
    "nickname": "Amazing Grace"
});
*/




/*

//saving data to the db
var ref2 = db.ref("itzik/pantsColor");
ref2.set({
    monday: {
        date_of_birth: "June 23, 1912",
        full_name: "Alan Turing"
    },
    friday: {
        date_of_birth: "December 9, 1906",
        full_name: "Grace Hopper"
    }
});
*/

/*
//verify a user
// idToken comes from the client app via https
firebase.auth().verifyIdToken(idToken).then(function(decodedToken) {
    var uid = decodedToken.sub;
    // ...
}).catch(function(error) {
    // Handle error
});*/



/*//AUTH A NEW USER - need to create a custom string first
var uid = "asdasdasd32q321effff3";
var customToken = firebase.auth().createCustomToken(uid);
console.log(customToken);*/
