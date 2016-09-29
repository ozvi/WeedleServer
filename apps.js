/**
 * Created by zvi on 8/8/2016.
 */
var express = require('express');

var app = express();
var requestIp = require('request-ip');
var firebase = require('firebase');
var Queue = require('firebase-queue');
var multer  = require('multer');
var upload = multer({ dest: 'uploads/' });
var fs = require('fs');
const PORT = 9450;
const MAX_CLICK_SPEED_MILLIS = 70;
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
    res.send('You shouldn\'t be here buddy. We\'ll hold on to your IP just in case ' + clientIp);
});
app.listen(app.get('port'),function(){
    console.log('server started on port itzik '+ app.get('port'));
});

// get winner social image file
app.post('/file_upload', upload.single('png'), function (req, res, next) {
    console.log('image file received!');
    //TODO NEED TO RENAME FILE BASED ON GAMENUM AND USER UID
});




const STATUS_NO_STATUS = 0;
const STATUS_GAME_RUNNING = 1;
const STATUS_PENDING_WINNER = 2;
const STATUS_NEW_GAME_DELAY = 3;
const STATUS_COMMERCIAL_BREAK = 4;

var gamePreset = {pendingWinner:"", status:STATUS_NO_STATUS, facebookTimerEndSeconds:50,blackList:[],qWinners:[],prizeImgUrl:"",currentGamePreset:0};
var game1 = gamePreset;
var game2 = gamePreset;

 var usersCallbackRef = db.ref("usersCallback");
 // Attach an asynchronous callback to read the data at our posts reference
usersCallbackRef.on("value", function(snapshot) {
     snapshot.forEach(function(childSnapshot) {
         var uidKey = childSnapshot.key;
         var childData = childSnapshot.val();
         if (childData.iWon) {
             var gameNum = isUserReallyWon(uidKey);
             var gameObj = getGameObj(gameNum);
             if (gameNum == 0) {
                 addToBlackList(uidKey);
                 removeUserCallback(uidKey,"");
                 return;
             }
             console.log("user callback i won notice");
            if(gameObj.status === STATUS_PENDING_WINNER){
                console.log("adding qWinner: " + uidKey);
                addToArray(gameObj.qWinners,uidKey);
                return;
            }
             //user really won, now needs to login facebook
             removeUserCallback(uidKey,"iWon");
             if(isTempBlockedUser(uidKey, gameNum)) {
                 console.log("winner is in a temp block: "+uidKey);
                 return;
             }

             updateGameStatus(gameNum, STATUS_PENDING_WINNER);
             newPendingWinner(gameNum);
             calcAndNotifyWinnerHeWon(uidKey, gameNum);
             startFacebookLoginTimer(gameNum,uidKey);
             gameObj.pendingWinner = uidKey;
             console.log("new pending winner for game "+gameNum);
         } else if (childData.facebookUser) {
             console.log("user callback new facebook account");
             onWinnerFacebookLogin(uidKey, childData.facebookUser);
             updateUserWinnerDetails(uidKey, childData.facebookUser);
             removeUserCallback(uidKey,"facebookUser");
         } else if (childData.userAddress) {
             //TODO SAVE WINNER ADDRESS
             removeUserCallback(uidKey,"userAddress");
         }
     });
 }, function (errorObject) {
 console.log("userscallback read failed: " + errorObject.code);
 });
function isTempBlockedUser(uidKey, gameNum) {
    var gameObj = getGameObj(gameNum);
    for(var i = 0; i < gameObj.blackList.length; i++){
        if(gameObj.blackList[i] === uidKey){
            return true;
        }
    }
    return false;
}
function startFacebookLoginTimer(gameNum,uid) {
    console.log("starting facebook timer for game "+gameNum);
    var gameRef = db.ref("games/game"+gameNum);
    var gameObj = (getGameObj(gameNum));
    console.log(gameObj);
    setTimeout(function(){
        if(gameObj.status === STATUS_PENDING_WINNER){
            console.log("timer ended. winner lost. resuming game (game running true, pending winner false)");
            gameRef.update({
                "gameRunning": true,
                "pendingWinnerInfo": null,
                "pendingWinner": false
            });
            //TODO CHECK IF WE HAVE QWINNERS WAITING IN LINE BEFORE RESTARTING THE GAME
            updateGameStatus(gameNum,STATUS_GAME_RUNNING);
            addUserToTempBlackList(uid,gameNum);
        }
    },gameObj.facebookTimerEndSeconds*1000);
}
function addUserToTempBlackList(uid,gameNum) {
    console.log("adding "+uid+" to temp black list");
    var gameObj = (getGameObj(gameNum));
    //TODO MAKE SURE THIS WORKS
    addToArray(gameObj.blackList,uid);
}

function addToArray(array, val){
    array[array.length] = val;
    console.log("array print:");
    console.log(array);
}
function isUserReallyWon(uid) {
    //TODO do when finish making gameScores
    //TODO FOR NOW ALWAYS RETURNING 1, NEED TO RETURN 0 WHEN NOTHING FOUND
    return 1;
    /*console.log("making sure user really won "+uid);
    if(game1.pendingWinner == uid){
        return 1;
    } else if(game2.pendingWinner == uid){
        return 2;
    }*/
    // console.log("User didn\'t really win - "+uid);
    // return 0;

}
function removeUserCallback(uid,folder) {
    console.log("removing user callback:callback/"+uid+"/"+folder);
    var userCallbackRed = db.ref("usersCallback/"+uid+"/"+folder);
    userCallbackRed.set(null);
}


function calcAndNotifyWinnerHeWon(uid, gameNum) {
    var timeStampRef = db.ref("timeStamp");
    timeStampRef.set(firebase.database.ServerValue.TIMESTAMP,function(error) {
        if (error) {
            console.log('Synchronization failed');
        } else {
            timeStampRef.once("value", function(snapshot) {
                console.log('server timestamp: '+snapshot.val());
                notifyWinnerHeWon(uid, gameNum,snapshot.val());
            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
        }
    });
}

function notifyWinnerHeWon(uid, gameNum, serverTimeStamp) {
    console.log("notify winner he won");
    var gameObj = getGameObj(gameNum);
    var userFolderRef = db.ref("games/game" + gameNum + "/pendingWinnerInfo");
    userFolderRef.set({
        pendingWinnerUid:uid,
        facebookTimerMillis:serverTimeStamp+gameObj.facebookTimerEndSeconds*1000
    });
}


function addToBlackList(uid) {
    console.log("adding "+uid+ " to black list");
    var blackListUidRef = db.ref("blackList/"+uid);
// Attach an asynchronous callback to read the data at our posts reference
    blackListUidRef.once("value", function(snapshot) {
        var count = 1;
        if(snapshot.val() != null)
            count += snapshot.val();
        blackListUidRef.set({
            "threatPoints" :  count,
            "lastUpdateMillis" :  getCurrentMillis()
        });
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}
function newPendingWinner(gameNum) {
    console.log("notify new pending winner");
    var gameRef = db.ref("games/game"+gameNum);
    gameRef.update({
        "gameRunning": false,
        "pendingWinner": true
    });
}

function updateGameStatus(gameNum, newGameStatus){
    console.log("updating game: "+gameNum+" with new status: "+newGameStatus);
    switch (gameNum){
        case 1:
            game1.status = newGameStatus;
            break;
        case 2:
            game2.status = newGameStatus;
            break;
    }

}
function getGameObj(gameNum){

    switch (gameNum){
        case 1:
            return game1;
        case 2:
            return game2;
        default:
            return null;
    }
}

function onWinnerFacebookLogin(uid, winnerObj){
    console.log("winner connected to facebook!");
    var gameNum = getWinnerGameNum(uid);
    updateGameStatus(gameNum, STATUS_NEW_GAME_DELAY);
    console.log("winner game num: "+ gameNum);
    if(gameNum === 0) {
        addToBlackList(uid);
        return;
    }
    publishWinnerDetails(gameNum,winnerObj);
    //TODO MAKE SURE FACEBOOK POST WORKS
    //pushFacebookPost(winnerObj.facebookToken);
   calcAndPushNewGame(gameNum)
}

function publishWinnerDetails(gameNum, winnerObj) {
    var gameObj = getGameObj(gameNum);

    publishWinnerDetailsToGame(gameNum, winnerObj);
    var billboardRef = db.ref("billboard");
    billboardRef.push().set({
        "firstName": winnerObj.firstName ,
        "lastName": winnerObj.lastName,
        "profileImgUrl": winnerObj.profileImgUrl,
        "prizeImgUrl": gameObj.prizeImgUrl,
        "timestamp": getCurrentMillis()
    });
}
function publishWinnerDetailsToGame(gameNum, winnerObj) {

    console.log("publishing new winner details!");
    var gameRef = db.ref("games/game"+gameNum+"/winner");
    gameRef.update({
        "firstName": winnerObj.firstName,
        "lastName":  winnerObj.lastName,
        "profileImgUrl": winnerObj.profileImgUrl
    });
}


function updateUserWinnerDetails(uid, winnerObj) {
    console.log("updating winner details");
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









function getWinnerGameNum(uid) {

    if (game1.pendingWinner == uid)
        return 1;
    if (game2.pendingWinner == uid)
        return 2;
    return 0;
}


function resetGameScores() {
    //TODO RESET BY GAME NUM
    console.log("resting game scores")
    var gameScoresRef = db.ref("gameScores");
    gameScoresRef.set(null);
}
function resetGame(gameNum){
    if(gameNum == 1){
        game1 = gamePreset;
    }else if(gameNum == 2){
        game2 = gamePreset;
    }
}

function calcAndPushNewGame (gameNum) {
    var timeStampRef = db.ref("timeStamp");
    timeStampRef.set(firebase.database.ServerValue.TIMESTAMP,function(error) {
        if (error) {
            console.log('Synchronization failed');
        } else {
            timeStampRef.once("value", function(snapshot) {
                console.log('server timestamp: '+snapshot.val());
                pushNewGame(gameNum,snapshot.val());
            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
        }
    });
}
function incrementCurrentGamePreset(gameNum) {
    if(gameNum == 1){
        game1.currentGamePreset = game1.currentGamePreset+1;
    }else if(gameNum == 2){
        game2.currentGamePreset = game2.currentGamePreset+1;
    }
}
function resetCurrentGamePreset(gameNum) {
    if(gameNum == 1){
        game1.currentGamePreset = 0;
    }else if(gameNum == 2){
        game2.currentGamePreset = 0;
    }
}
function pushNewGame(gameNum, gameStartTime){
    console.log("game start time millis: "+gameStartTime);
    if(newGameTimeout != null){
        clearTimeout(newGameTimeout);
    }
    resetGameScores();
    incrementCurrentGamePreset(gameNum);
    updateGameStatus(gameNum, STATUS_GAME_RUNNING);
    resetGame(gameNum);
    var localGameObj = getGameObj(gameNum);
    var gamesPresetsRef = db.ref("gamePresets/game"+gameNum+"/"+localGameObj.currentGamePreset);
    // Attach an asynchronous callback to read the data at our posts reference
    console.log("currentRunningGame: "+localGameObj.currentGamePreset);
    gamesPresetsRef.once("value", function(snapshot) {
        var gameObj = snapshot.val()
        if(gameObj == null){
            resetCurrentGamePreset(gameNum);
            pushNewGame(gameNum,gameStartTime);
            return;
        }

        var gameRef = db.ref("games/game"+gameNum);
        gameRef.update({
            "backgroundUrl": gameObj.backgroundUrl,
            "gameRunning": false,
            "gameSize": gameObj.gameSize,
            "prizeImgUrl": gameObj.prizeImgUrl,
            "prizeName": gameObj.prizeName,
            "pendingWinnerInfo": null,
            "pendingWinnerUid": null,
            "newGameStarted": false,
            "startTimeMillis": gameStartTime+gameObj.secsDelay*1000,
            "resetGameScores": true
        });
        setLocalGamePrize(gameNum, gameObj.prizeImgUrl);
        //start timer for game start
        startGameTimer(gameObj.secsDelay,gameRef);
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });

};



function setLocalGamePrize(gameNum, prizeImgUrl) {
    if(gameNum == 1)
        game1.prizeImgUrl = prizeImgUrl;
   else  if(gameNum == 2)
        game2.prizeImgUrl = prizeImgUrl;
}
var newGameTimeout;
function startGameTimer (seconds, gameRef) {
    console.log("timer start: " +seconds);
    newGameTimeout = setTimeout(function(){
        gameRef.update({
        "gameRunning": true,
        "pendingWinner": null,
        "newGameStarted": true,
        "winner": null,
        "medianBarPercent": 0,
        "resetGameScores": false

        })
        resetGameScores();
    }, seconds*1000);
};


function getCurrentMillis(){
    var d = new Date();
    return d.getTime();
}
function calcFutureTimerMillis (millis) {
    console.log("current millis: " + getCurrentMillis());
    var timeMillis = getCurrentMillis()+(millis);
    console.log("results millis: " + timeMillis);
    return timeMillis;
};









 var adminControlRef = db.ref("adminControl");
 // Attach an asynchronous callback to read the data at our posts reference
adminControlRef.on("value", function(snapshot) {
    if(snapshot.val().game1Reset == true){
        adminGameReset(1);
    }else if(snapshot.val().game2Reset == true){
        adminGameReset(2);
    };


 }, function (errorObject) {
 console.log("The read failed: " + errorObject.code);
 });

function adminGameReset(gameNum) {
    calcAndPushNewGame(gameNum);
    var adminGameResetRef = db.ref("adminControl/game"+gameNum+"Reset");
    var firstWinner = true;
    var billboardRef = db.ref("billboard").limitToFirst(1);//orderByChild('timestamp').startAt(Date.now());
    billboardRef.once("value", function(snapshot) {
        console.log("foreach billboard started ");
        try {
        snapshot.forEach(function(childSnapshot) {
            var serverWinnerObj = childSnapshot.val();
            console.log("firstWinnerState: " +firstWinner);
            if(firstWinner === true){
                console.log("found first winner");
                var winnerObj = {firstName:serverWinnerObj.firstName,lastName:serverWinnerObj.lastName,profileImgUrl:serverWinnerObj.profileImgUrl};
                console.log(winnerObj);
                publishWinnerDetailsToGame(gameNum,winnerObj);
                firstWinner = false;

            }else {
                    throw "myException"; // generates an exception
                }
            }
        );
        } catch (e) {
        }
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
    adminGameResetRef.set(false);
    firstWinner = true;
}


//queue workers

var firebaseQueueRef = db.ref('queue');
var options = {
    'numWorkers': 1
};
var gameScoresQueue = new Queue(firebaseQueueRef,options, function(gameScoreTask, progress, resolve, reject) {
    // Read and process task data
    console.log("queue:");
    console.log(gameScoreTask);
    verifyGameScore(gameScoreTask);
    setTimeout(function() {
        resolve();
    }, 0);
});

function verifyGameScore(gameScoreTask) {
    var gameScoresRef = db.ref("gameScores/"+gameScoreTask.uid+"/game"+gameScoreTask.gameNum);
    var currentTimeMillis = getCurrentMillis();
    gameScoresRef.once("value", function(snapshot) {
        try {
            var gameScoreObj = snapshot.val();
            var scoreGap = gameScoreTask.score - gameScoreObj.score;
            if(scoreGap == 0)return;
                var timeGap = currentTimeMillis - gameScoreObj.lastUpdateMillis;
                var speed = timeGap/scoreGap;
            console.log("scoreGap: " + scoreGap);
            console.log("timeGap: " + timeGap);
            console.log("speed: " + speed);

            if(speed < MAX_CLICK_SPEED_MILLIS){
                addToBlackList(gameScoreTask.uid);
            }else{
                updateNewGameScore(gameScoreTask, gameScoresRef, currentTimeMillis);

            }
        }
        catch(err) {
            updateNewGameScore(gameScoreTask, gameScoresRef, currentTimeMillis);
        }
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}
function updateNewGameScore(gameScoreTask, gameScoresRef, currentTimeMillis) {
        console.log("New game score: " + gameScoreTask.score);
    gameScoresRef.set({
        "score":gameScoreTask.score,
        "lastUpdateMillis":currentTimeMillis
    });
}



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


