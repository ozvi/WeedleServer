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
var currentRunningGame = 0;
var facebookRequire = require('fb');

facebookRequire.options({version: 'v2.4'});
var options = facebookRequire.extend({appId: '1152404564834495', appSecret: '6fe1247db8011460545bd9dc39f81d63'});
var facebook = new facebookRequire.Facebook(options);



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





const STATUS_GAME_RUNNING = 1;
const STATUS_PENDING_WINNER = 2;
const STATUS_NEW_GAME_DELAY = 3;
const STATUS_COMMERCIAL_BREAK = 4;


var game1 = {uid:"", status:0};
var game2 = {uid:"", status:0};

 var usersCallbackRef = db.ref("usersCallback");
 // Attach an asynchronous callback to read the data at our posts reference
usersCallbackRef.on("value", function(snapshot) {
     snapshot.forEach(function(childSnapshot) {
         var uidKey = childSnapshot.key;
         var childData = childSnapshot.val();
         //check game num
         //check cheater
         //notify winner/continue game
         var gameNum = isUserReallyWon(uidKey);
         if (gameNum == 0) {
             addToBlackList(uidKey);
             removeUserCallback(uidKey);
            return;
         }
         if (childData.iWon) {
             //user really won, now needs to login facebook
             updateGameStatus(gameNum, STATUS_PENDING_WINNER);
             newPendingWinner(gameNum);
             notifyWinnerHeWon(uidKey, gameNum);
             removeUserCallback(uidKey);
         } else if (childData.facebookUser) {
             updateGameStatus(gameNum, STATUS_NEW_GAME_DELAY);
             onWinnerFacebookLogin(uidKey, childData.facebookUser.val());
             updateUserWinnerDetails(uidKey, childData.facebookUser.val())
             removeUserCallback(uidKey);
         }
     });
 }, function (errorObject) {
 console.log("userscallback read failed: " + errorObject.code);
 });
function isUserReallyWon(uid) {
    //TODO do when finish making gameScores
    return 1;
}
function removeUserCallback(uid) {
    var userCallbackRed = db.ref("usersCallback/"+uid);
    userCallbackRed.set(null);
}
function notifyWinnerHeWon(uid, gameNum) {
    var userFolderRef = db.ref("users/"+uid+"/game"+gameNum);
    userFolderRef.update(true);
}


function addToBlackList(uid) {
    var blackListUidRef = db.ref("blackList/"+uid);
// Attach an asynchronous callback to read the data at our posts reference
    blackListUidRef.once("value", function(snapshot) {
        blackListUidRef.update({
            "threatPoints" :  snapshot.threatPoints++,
            "lastUpdateMillis" :  getCurrentMillies()
        });
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}
function newPendingWinner(gameNum) {
    var gameRef = db.ref("games/game"+gameNum);
    gameRef.update({
        "gameRunning": false,
        "pendingWinner": true
    });
}

function updateGameStatus(gameNum, newGameStatus){
    switch (gameNum){
        case 1:
            game1.status = newGameStatus;
            break;
        case 2:
            game2.status = newGameStatus;
            break;
    }

}



function onWinnerFacebookLogin(uid, winnerObj){
    var gameNum = getWinnerGameNum(uid);
    publishWinnerDetails(gameNum,winnerObj)
    pushFacebookPost(winnerObj.facebookToken);
    pushNewGame(gameNum);
}

function publishWinnerDetails(gameNum, winnerObj) {
    var gameRef = db.ref("games/game"+gameNum+"/winner");
    gameRef.update({
        "firstName": winnerObj.firstName,
        "lastName":  winnerObj.lastName,
        "email":  winnerObj.email,
        "friendsCount":  winnerObj.friendsCount,
        "profileImgUrl": winnerObj.profileImgUrl
    });
    var billboardRef = db.ref("billboard");
    billboardRef.push().set({
        "firstName": winnerObj.firstName ,
        "lastName": winnerObj.lastName,
        "profileImgUrl": winnerObj.profileImgUrl,
        "timestamp": getCurrentMillies()
    });
}

function updateUserWinnerDetails(uid, winnerObj) {
    var userFolderRef = db.ref("users/"+uid);
    userFolderRef.update({
        "firstName": winnerObj.firstName,
        "lastName":  winnerObj.lastName,
        "email":  winnerObj.email,
        "friendsCount":  winnerObj.friendsCount,
        "facebookToken":  winnerObj.facebookToken,
        "profileImgUrl": winnerObj.profileImgUrl
    });
}



function pushFacebookPost(facebookToken) {

    facebook.setAccessToken(facebookToken);

    facebook.api('weedleApp/photos', 'post', {
        source: fs.createReadStream('uploads/test_image.png'),
        caption: 'My vacation with itztik'
    }, function (res) {
        if (!res || res.error) {
            console.log(!res ? 'error occurred' : res.error);
            return;
        }
        console.log('Post Id: ' + res.post_id);
    })
}









function getWinnerGameNum(uid){
    var ref = db.ref("users/"+uid);
// Attach an asynchronous callback to read the data at our posts reference
    ref.once("value", function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
            var key = childSnapshot.key;
            var childData = childSnapshot.val();
            if(key.startsWith("game")){
                if(childData == true){
                    return   key;
                }
            }
        });
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}





function pushNewGame(gameNum){
    currentRunningGame++;
    var gamesPresetsRef = db.ref("gamePresets/game"+currentRunningGame);
    // Attach an asynchronous callback to read the data at our posts reference
    console.log("game"+currentRunningGame);
    gamesPresetsRef.once("value", function(snapshot) {
        //set the current game to fb db
        var gameObj = snapshot.val()
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
    setTimeout(function(){
        gameRef.update({
        "gameRunning": true,
        "winnerWon": false,
        "winner": null,
        "medianBarPercent": 0
    })}, minutes*60*1000);
};

function getCurrentMillies(){
    var d = new Date();
    return currentMillis = d.getTime();
}
function calcNextGameStartTimeMillis (minutes) {
    console.log("minutes: " + minutes);
    console.log("current millis: " + getCurrentMillies());
    var timeMillis = getCurrentMillies()+(minutes*60*1000);
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
console.log(custom
    /**/