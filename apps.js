/**
 * Created by zvi on 8/8/2016.
 */
var express = require('express');
var app = express();
var bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

var requestIp = require('request-ip');
var firebase = require('firebase');
var Queue = require('firebase-queue');
var request = require('request');
var multer  = require('multer');
var FormData = require('form-data'); //Pretty multipart form maker.
var restler = require('restler');
 var poster= require('poster');
var upload = multer({ dest: 'uploads/' });
var fs = require('fs');


const PORT = 9450;
const TOP_LOSERS_THRESHOLD = 5;
const MEDIAN_BAR_INTERVAL = 1000*10;
const MAX_CLICK_SPEED_MILLIS = 30;
const MIN_FIRST_COMMIT_SCORE = 2000; // the max allowed first score queue request
const MIN_ALLOWED_WINNER_SCORE_GAP = 1000;
const PUSH_NOTIFY_PRE_GAME_MILLIS = 1000;
const DEFAULT_HELMET_LEVEL = 0;
const FACEBOOK_POST_URL_PREFIX = "https://www.facebook.com/weedleApp/photos/";
const FACEBOOK_TOKEN = "EAAQYGxi5eL8BACcpWZBgcdVX1IQtT55OXUiPDiCybtLDpcnli4p9B5YBLAC4bILF6uZCzZAfU3ZAvvdLZCiqLD2BQ8SmIxsp1UAIOYSmQR6YCis6uKdQ4aj9yTYgr6JWd1kcsWV9ZAtPVtHvibhRiUAPQOr5TZAkXAZD";
var facebookRequire = require('fb');
facebookRequire.options({version: 'v2.4'});
var options = facebookRequire.extend({appId: '1152404564834495', appSecret: '6fe1247db8011460545bd9dc39f81d63'});
var facebook = new facebookRequire.Facebook(options);






//queue options
var queueOptions = {
    'numWorkers': 1
};


const STATUS_NO_STATUS = 0;
const STATUS_GAME_RUNNING = 1;
const STATUS_PENDING_WINNER = 2;
const STATUS_WINNER_LOGGED_IN = 3;
const STATUS_NEW_GAME_TIMER = 4;
const STATUS_COMMERCIAL_BREAK = 5;

const TOP_LOSER_LOOP_NOTIFY= 2;
//TODO REPLACE WITH REAL ONE
// const WINNER_TIMEOUT_MILLIS = (1000*60*60)*23;
const WINNER_TIMEOUT_MILLIS = 1000*60*2;
const NUM_OF_HELMETS = 2;
const COMMERCIAL_BREAK_TIME_MILLIS = 1000*20;
const PNG_RECEIVE_TIMEOUT_MILLIS = 1000*10;
const  MAX_COMMERCIAL_END_GAME_PERCENT = 95;


/*const gamePreset = {gameNum:0,pendingWinner:"", status:STATUS_NO_STATUS, facebookTimerEndSeconds:50,blackList:[],qWinners:[],
    prizeImgUrl:"",currentGamePreset:0,gameSize:0,facebookPostMsg:"",facebookPostLink:""};*/
var activeGames = [1,2];
var game1 = {};
var game2 = {};
var game1ActiveUsersScores = {};
var game2ActiveUsersScores = {};
var pushNotifyUidListGame1 = [];
var pushNotifyUidListGame2 = [];
var topLosersUids = [];
var timeoutWinners= {};
//this will count for how many times medain was calculated since last game won
var topLosersLoopCount = TOP_LOSERS_THRESHOLD;






firebase.initializeApp({
    serviceAccount: "./Weedle-69d94723eed7.json",
    databaseURL: "https://weedle-27e37.firebaseio.com",
    databaseAuthVariableOverride: {
        uid: "server_worker_1"
    }
});

var db = firebase.database();
medianCalcInfinateLoop(MEDIAN_BAR_INTERVAL);
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
    var gameNum = req.body.gameNum;
    console.log('image upload for game num'+gameNum);
    var gameObj = getGameObj(parseInt(gameNum));
    var uid = req.body.uid;
    var imgFileName = req.file.filename;
    console.log('uid from file: '+ uid);
    console.log('image name: '+ imgFileName);
    if(uid == null || req.file == null || gameNum  == null) {
        console.log('corrupted image file received');
        return;
    }else{
        if(pngReceivedTimer != null){
            updateGameStatus(gameNum, STATUS_NEW_GAME_TIMER);
            clearTimeout(pngReceivedTimer);
        }
    }
    console.log('game object after png received:');
    console.log(gameObj);

    postToFacebookPage(gameObj,imgFileName);
});



function runCommercialBreaks(gameNum) {
    var gameCommercialRef = db.ref("games/game"+gameNum+"vars/commercialBreak");
    var timeStampRef = db.ref("timeStamp");
    updateGameStatus(gameNum,STATUS_COMMERCIAL_BREAK);
    timeStampRef.set(firebase.database.ServerValue.TIMESTAMP,function(error) {
        if (error) {
            console.log('Synchronization failed');
        } else {
            timeStampRef.once("value", function(snapshot) {
                console.log('server timestamp for commercial break: '+snapshot.val());
                gameCommercialRef.set(snapshot.val() + COMMERCIAL_BREAK_TIME_MILLIS);
                setTimeout(function() {
                    gameCommercialRef.set(null);
                    updateGameStatus(gameNum,STATUS_GAME_RUNNING);
                },COMMERCIAL_BREAK_TIME_MILLIS);

            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
        }
    });






}







var addressQueueRef = db.ref('addressQueue');
var addressQueue = new Queue(addressQueueRef,queueOptions , function(addressTask, progress, resolve, reject) {
    console.log("recevied new address queue for "+addressTask.uid);
    console.log(addressTask);
    validateAddressQueue(addressTask);
    setTimeout(function() {
        resolve();
    }, 0);
});

var iWonQueueRef = db.ref('iWonQueue');
var iWonQueue = new Queue(iWonQueueRef, queueOptions , function(iWonTask, progress, resolve, reject) {
    iWon(iWonTask.uid,iWonTask.gameNum);
    setTimeout(function() {
        resolve();
    }, 0);
});


var helmetQueueRef = db.ref('helmetQueue');
var helmetQueue = new Queue(helmetQueueRef, queueOptions , function(helmetTask, progress, resolve, reject) {
    console.log("recevied new helmet queue for "+helmetTask.uid);
    incrementHelmetToUser(helmetTask.uid);
    setTimeout(function() {
        resolve();
    }, 0);
});


/*var pushNotifyQueueRef = db.ref('pushNotifyQueue');
var pushNotifyQueue = new Queue(pushNotifyQueueRef, queueOptions , function(pushNotifyTask, progress, resolve, reject) {
    console.log("push notify me queue arrived!");
    console.log(pushNotifyTask);
    //TODO ACTIVATE WHEN NEEDING PUSH NOTIFICATION SERVICES
    //addUidToPushNotifyList(pushNotifyTask);
    setTimeout(function() {
        resolve();
    }, 0);
});*/
/*function addUidToPushNotifyList(pushNotifyTask) {
    var gameNum = pushNotifyTask.gameNum;
    if(gameNum == 1){
        addToArray(pushNotifyUidListGame1,pushNotifyTask.uid);
    }else if(gameNum == 2){
        addToArray(pushNotifyUidListGame2,pushNotifyTask.uid);
    }
}
function clearPushNotifyList(gameNum) {
    if(gameNum == 1){
        pushNotifyUidListGame1 = [];
    }else if(gameNum == 2){
        pushNotifyUidListGame2 = [];
    }
}*/


var facebookUserQueueRef = db.ref('facebookUserQueue');
var facebookUserQueue = new Queue(facebookUserQueueRef, queueOptions , function(facebookUserTask, progress, resolve, reject) {
    console.log("facebook user queue new facebook account");
    if(isWinnerFacebookLogin(facebookUserTask)){
        onWinnerFacebookLogin(facebookUserTask);
        addTimeoutWinner(facebookUserTask.uid);
    }
    updateUserFacebookDetails(facebookUserTask);
    setTimeout(function() {
        resolve();
    }, 0);
});
function isWinnerFacebookLogin(facebookUserTask) {
    if(getGameObj(facebookUserTask.gameNum).pendingWinner == facebookUserTask.uid)
        return true;
    return false;
}



function incrementHelmetToUser(uid) {
    var userRef = db.ref("users/"+uid);
    var userHelmetLevelRef = db.ref("users/"+uid+"/helmetLevel");
    userHelmetLevelRef.once("value", function(snapshot) {
        console.log("incrementing helmetLevel to uid "+uid);
        var newHelmetLevel = snapshot.val()+1;
        if(newHelmetLevel >= NUM_OF_HELMETS)
            return;
        userRef.update({
            "helmetLevel": newHelmetLevel
        });
        updateHelmetLevelToBillboard(uid,newHelmetLevel);
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}

function updateHelmetLevelToBillboard(uid,newHelmetLevel) {
    var billboardRef = db.ref("billboard");
    billboardRef.once("value", function(snapshot) {
        console.log("updating billboard with new helmet level for uid "+uid);
            snapshot.forEach(function(childSnapshot) {
                var billboardSingleObj = childSnapshot.val();
                console.log(billboardSingleObj);
                console.log("check "+uid+" and uid "+billboardSingleObj.uid);
                if(uid == billboardSingleObj.uid) {
                    var billboardHelmetRef = db.ref("billboard/"+childSnapshot.key+"/helmetLevel");
                    billboardHelmetRef.set(newHelmetLevel);
                }
            });

    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}
function updateCountryToBillboard(uid,countryName) {
    var billboardRef = db.ref("billboard");
    billboardRef.once("value", function(snapshot) {
        console.log("updating billboard with new helmet level for uid "+uid);
        snapshot.forEach(function(childSnapshot) {
            var billboardSingleObj = childSnapshot.val();
            console.log(billboardSingleObj);
            console.log("check "+uid+" and uid "+billboardSingleObj.uid);
            if(uid == billboardSingleObj.uid) {
                var billboardHelmetRef = db.ref("billboard/"+childSnapshot.key+"/country");
                billboardHelmetRef.set(countryName);
            }
        });

    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}

function validateAddressQueue(addressTask) {
    // for (var winnerUid in timeoutWinners){
    //     if (typeof timeoutWinners[winnerUid] !== 'function') {
    //         if(addressTask.uid == winnerUid){
    var userRef =  db.ref('users/'+addressTask.uid+"/address");
    userRef.set({
                    "fullName": addressTask.fullName,
                    "address1": addressTask.address1,
                    "address2": addressTask.address2,
                    "city": addressTask.city,
                    "state": addressTask.state,
                    "country": addressTask.country,
                    "zip": addressTask.zip,
                    "phone": addressTask.phone,
                    "comment": addressTask.comment
                });
    updateCountryToBillboard(addressTask.uid,addressTask.country);
                // return;
            // }
        // }
    // }
}






function validateTimeoutWinnersList() {
    var currentTimeMillis = getCurrentMillis();
    console.log('winner timeout list before:');
    console.log(timeoutWinners);
    for (var winnerUid in timeoutWinners){
        if (typeof timeoutWinners[winnerUid] !== 'function') {
            if (currentTimeMillis >= timeoutWinners[winnerUid]) {
                console.log('winner deleted  - '+winnerUid);
                delete timeoutWinners[winnerUid];
                var winnerTimeoutRef =  db.ref("users/"+winnerUid+"/winnerTimeout");
                winnerTimeoutRef.set(null);
            }
        }
    }
    console.log('winner timeout list after:');
    console.log(timeoutWinners);
}
function addTimeoutWinner(uid) {
    var timeStampRef = db.ref("timeStamp");
    timeStampRef.set(firebase.database.ServerValue.TIMESTAMP,function(error) {
        if (error) {
            console.log('Synchronization failed');
        } else {
            timeStampRef.once("value", function(snapshot) {
                timeoutWinners[uid] = snapshot.val()+WINNER_TIMEOUT_MILLIS;
                var userRef =  db.ref("users/"+uid+"/winnerTimeout");
                userRef.set(snapshot.val() + WINNER_TIMEOUT_MILLIS);
            }, function (errorObject) {
                console.log("The read failed: " + errorObject.code);
            });
        }
    });
}








var pngReceivedTimer;
function startPngReceiveTimer(gameNum) {
    pngReceivedTimer = setTimeout(function(){
        //check if png failed
        var gameObj = getGameObj(gameNum);
        if(gameObj.status == STATUS_WINNER_LOGGED_IN){
            updateGameStatus(gameNum, STATUS_NEW_GAME_TIMER);
            var path = __dirname + "/uploads/defaultWinnerImg"+gameNum+".png";
            downloadPng(gameObj.prizeImgUrl, path, function(){
                console.log('done');
                postToFacebookPage(gameObj,"defaultWinnerImg"+gameNum+".png");
            });

        }

    }, PNG_RECEIVE_TIMEOUT_MILLIS);

}


var downloadPng = function(uri, filename, callback){
    request.head(uri, function(err, res, body){
        console.log('content-type:', res.headers['content-type']);
        console.log('content-length:', res.headers['content-length']);

        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
};





function postToFacebookPage(gameObj, imgName) {
    var winnerObj = gameObj.winnerObj;
    var path = __dirname + "/uploads/" + imgName;
    var idArrayString = "[{'tag_uid':'" + winnerObj.facebookId.toString() + "','x':0,'y':0}]";
    var winnerFullName = winnerObj.firstName+" "+winnerObj.lastName;
    /*console.log(idString);
     console.log(winnerObj);
     console.log(gameObj);
     console.log(path);*/
    fs.stat(path, function (err, stats) {
        restler.post("https://graph.facebook.com/me/photos?access_token=" + FACEBOOK_TOKEN, {
            multipart: true,
            data: {
                "message": formatString(gameObj.facebookPostMsg,[winnerObj.firstName,winnerObj.lastName]),
                "source": restler.file(path, null, stats.size, null, "image/png"),
                "tags": idArrayString
            }
        }).on("complete", function (data) {
            if(data.id) {
                console.log("Facebook post success!");
                console.log("Updating facebook post url to game "+gameObj.gameNum);
                var facebookPostLink = FACEBOOK_POST_URL_PREFIX + data.id+"*"+data.post_id;
                updateLocalGameObjWithFacebookLink(gameObj.gameNum,facebookPostLink);
                publishWinnerDetails(gameObj.gameNum);
            }
        });
    });
}
function formatString(source, params) {
    var arrayLength = params.length;
    for (var i = 0;i < arrayLength; i++){
        source = source.replace(new RegExp("\\{" + i + "\\}", "g"), params[i]);
    }
    return source;
}
function updateLocalGameObjWithFacebookLink(gameNum,facebookPostLink) {
        switch (gameNum){
            case 1:
                game1.winnerObj.facebookPostLink = facebookPostLink;
                break;
            case 2:
                game2.winnerObj.facebookPostLink = facebookPostLink;
                break;
        }
}
function removeUserFromActiveUsers(uid) {
    console.log("User removed from active users "+uid);
    delete game1ActiveUsersScores[uid];
    delete game2ActiveUsersScores[uid];
    console.log(game1ActiveUsersScores);
}

function addScoreToGameCount(gameNum, uid, score) {
    var activeUsersObj = getActiveUsersScoresObj(gameNum);
    if(gameNum == 1){
        game1ActiveUsersScores[uid] = score;
    }else if(gameNum == 2){
        game2ActiveUsersScores[uid] = score;
    }
    console.log("Active users list updated - game "+gameNum);
    console.log(activeUsersObj);
}

function getActiveUsersScoresObj(gameNum) {
    if(gameNum == 1){
        return game1ActiveUsersScores;
    }else if(gameNum == 2){
        return game2ActiveUsersScores;
    }
}
function pushNewMedianToGames() {
    for(var i = 0; i < activeGames.length; i++){
        var gameNum = i+1;
        var gameObj = getGameObj(gameNum);

        if(gameObj.gameSize == null || gameObj.gameSize == 0)return;
        var activeUsersObj = getActiveUsersScoresObj(gameNum);
        var usersCount = Object.keys(activeUsersObj).length;

        var sortsScores = [];
        for (var user in activeUsersObj)
            sortsScores.push([user, activeUsersObj[user]])
        sortsScores.sort(
            function(a, b) {
                return a[1] - b[1]
            }
        )
        var topScore = sortsScores[sortsScores.length-1];
        shouldRunCommercialBreaks(gameObj,topScore);
        console.log("Sorted scores");
        console.log(sortsScores);
        var percent = 0;
    if(sortsScores.length != 0){
        var median = 0;
        if(usersCount%2 != 0){
            var scoreArray =  sortsScores[((usersCount+1)/2)-1];
            median = scoreArray[1];
        }else{
            var firstArg = sortsScores[(usersCount/2)-1];
            var secArg = sortsScores[usersCount/2];
            median =  (firstArg[1]+secArg[1])/2;
        }
        percent = parseInt((median/gameObj.gameSize)*100);
    }
    console.log("Median percent for game"+gameNum+": " + percent);
    var gameMedianRef =  db.ref("games/game"+gameNum+"vars/medianBarPercent");
        gameMedianRef.set(percent);
    }
}
function shouldRunCommercialBreaks(gameObj,topScore) {
    if(gameObj.status != STATUS_GAME_RUNNING)return;
    if(topScore == null || gameObj.commercialBreaksPercents == null)return;
    console.log(gameObj.gameSize);
    for(var i = 0; i <  gameObj.commercialBreaksPercents.length; i++){
        var commercialPercent = gameObj.commercialBreaksPercents[i];
        var scorePercent = (topScore[1]/gameObj.gameSize)*100;
        if(scorePercent >= MAX_COMMERCIAL_END_GAME_PERCENT)return;
        if( scorePercent >= commercialPercent){
            runCommercialBreaks(gameObj.gameNum);
            deleteFromCommercialBreak(gameObj.gameNum,i);
        }
    }
}
function deleteFromCommercialBreak(gameNum,index) {
    if(gameNum == 1)
         game1.commercialBreaksPercents.splice(index, 1);
     else if(gameNum == 2)
         game2.commercialBreaksPercents.splice(index, 1);
}

function medianCalcInfinateLoop(interval) {
    function go () {
        pushNewMedianToGames();
        validateTimeoutWinnersList();
        resetTopLosersValues();
        setTimeout(go,interval);
    }
    go();
}

function resetTopLosersValues () {
    if(topLosersLoopCount >= TOP_LOSER_LOOP_NOTIFY)
        return;
    topLosersLoopCount++;
    if(topLosersLoopCount >= TOP_LOSER_LOOP_NOTIFY){
        for(var i = 0; i < topLosersUids.length; i++){
            var topLoserRef = db.ref("users/"+topLosersUids[i]+"/topLoserNotifier");
            topLoserRef.set(null);
        }
    }
}











function verifyNotWinnerTimeout(uid,gameNum) {
    if (uid in timeoutWinners)
        return 0;
    return gameNum;
}



function iWon(uid,gameNum) {
    var blackListRef = db.ref("blackList");
// Attach an asynchronous callback to read the data at our posts reference
    blackListRef.once("value", function(snapshot) {
        console.log("fffffffffff");
        snapshot.forEach(function(childSnapshot) {
            var serverUid = childSnapshot.key;
            if(serverUid == uid){
                addToBlackList(uid);
                return;
            }
        });
        //not black list
        //now verify he really won
        console.log("game iWon uid: "+uid);
        var userGameScoresRef = db.ref("gameScores/game"+gameNum+"/"+uid);
        userGameScoresRef.once("value", function(snapshot) {
            var gameScoreObj = snapshot.val();
            if(gameScoreObj != null){
                console.log("winner game score: "+gameScoreObj.score);
                gameNum = checkReallyWon(gameNum,gameScoreObj,uid);
                console.log("winner found for game " + gameNum);
            }else{
                //means he never had a game score, can't be a real winner
                gameNum = 0;
            }
            gameNum = verifyNotWinnerTimeout(uid,gameNum);
            if (gameNum == 0) {
                addToBlackList(uid);
                return;
            }
            var gameObj = getGameObj(gameNum);
            console.log("user callback i won notice");
            if(gameObj.status === STATUS_PENDING_WINNER){
                console.log("adding qWinner: " + uid);
                addToArray(gameObj.qWinners,uid);
                return;
            }
            //user really won, now needs to login facebook
            if(isTempBlockedUser(uid, gameNum)) {
                console.log("winner is in a temp block: "+uid);
                return;
            }
            pendingWinnerFuncs(uid,gameNum);
        }, function (errorObject) {
            console.log("The read failed: " + errorObject.code);
        });
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}

function pendingWinnerFuncs(uid,gameNum) {
    updateLocalGameObjPendingWinner(gameNum,uid);
    updateGameStatus(gameNum, STATUS_PENDING_WINNER);
    newPendingWinner(gameNum);
    calcAndNotifyWinnerHeWon(uid, gameNum);
    startFacebookLoginTimer(gameNum,uid);
    console.log("new pending winner for game "+gameNum);
}

function updateLocalGameObjPendingWinner(gameNum,uid) {
    switch (gameNum){
        case 1:
            game1.pendingWinner = uid;
            break;
        case 2:
            game2.pendingWinner = uid;
            break;
    }
}




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
    var gameRef = db.ref("games/game"+gameNum+"vars");
    var gameObj = (getGameObj(gameNum));
    console.log(gameObj);
    setTimeout(function(){
        if(gameObj.status === STATUS_PENDING_WINNER){
            addUserToTempBlackList(uid,gameNum);
            var qWinner = pullQwinner(gameObj);
            if(qWinner == null){
                console.log("timer ended. winner lost. resuming game (game running true, pending winner false)");
                gameRef.update({
                    "gameRunning": true,
                    "pendingWinnerInfo": null,
                    "pendingWinner": false
                });
                updateGameStatus(gameNum,STATUS_GAME_RUNNING);
            }else{
                pendingWinnerFuncs(qWinner,gameNum);
            }
        }
    },gameObj.facebookTimerEndSeconds*1000);
}
function pullQwinner(gameObj) {
    if(gameObj.qWinners == null || gameObj.qWinners.length == 0)
        return null;
    var qWinner = gameObj.qWinners[0];
    delete gameObj.qWinners[0];
    return qWinner;
}
function addUserToTempBlackList(uid,gameNum) {
    console.log("adding "+uid+" to temp black list");
    var gameObj = (getGameObj(gameNum));
    addToArray(gameObj.blackList,uid);
}

function addToArray(array, val){
    array[array.length] = val;
    console.log("array print:");
    console.log(array);
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
    var userFolderRef = db.ref("games/game" + gameNum + "vars/pendingWinnerInfo");
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
            count += snapshot.val().threatPoints;
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
    var gameRef = db.ref("games/game"+gameNum+"vars");
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

function onWinnerFacebookLogin(winnerObj){
    console.log("winner connected to facebook!");
    var gameNum = getWinnerGameNum(winnerObj.uid);
    updateGameStatus(gameNum, STATUS_WINNER_LOGGED_IN);
    console.log("winner game num: "+ gameNum);
    if(gameNum === 0) {
        addToBlackList(winnerObj.uid);
        return;
    }
    updateLocalGameObjNewWinner(gameNum,winnerObj);
    updateTopLosers(gameNum);
   calcAndPushNewGame(gameNum);
    startPngReceiveTimer(gameNum);
}

function updateTopLosers(gameNum) {
    console.log("Updating top losers for game"+gameNum);
    var activeUsersObj = getActiveUsersScoresObj(gameNum);
    console.log("active users");
    console.log(activeUsersObj);
    var usersCount = Object.keys(activeUsersObj).length;
    var sortsScores = [];
    for (var user in activeUsersObj)
        sortsScores.push([user, activeUsersObj[user]])
    sortsScores.sort(
        function(a, b) {
            return a[1] - b[1]
        }
    )


    /*
     [ [ 'uGsUXvket6Xu3wAxudulPUUKRfp1', 100 ],
     [ 'JuBSTYZAWwUND4zAwJ3QHqBAWQo2', 100 ] ]

     */
    console.log("top scores");
    console.log(sortsScores);
    var topLoserLimit = TOP_LOSERS_THRESHOLD;
    if(usersCount < TOP_LOSERS_THRESHOLD)
        topLoserLimit = usersCount;

    console.log("top loser limit");
    console.log(topLoserLimit);
    for(var i = 0; i < topLoserLimit-1; i++){
        var uid = sortsScores[usersCount-i-2][0];
        console.log("uid");
        console.log(uid);
        var topLoserUserRef = db.ref("users/"+uid+"/topLoserNotifier");
        topLoserUserRef.set({
            "usersCount":usersCount,
            "loserIndex":i+2,
        })
        addToArray(topLosersUids,uid);
    }
    topLosersLoopCount = 0;
}

function updateLocalGameObjNewWinner(gameNum,winnerObj) {
    console.log("winner obj");
    console.log(winnerObj);

    if(gameNum == 1){
        game1.winnerObj = {};
        game1.winnerObj = winnerObj;
    }else if(gameNum == 2){
        game2.winnerObj = {};
        game2.winnerObj = winnerObj;
    }
}

function publishWinnerDetails(gameNum) {
    var gameObj = getGameObj(gameNum);
    var winnerObj = gameObj.winnerObj;
    publishWinnerDetailsToGame(gameNum, winnerObj);
    var billboardRef = db.ref("billboard");
    billboardRef.push().set({
        "firstName": winnerObj.firstName ,
        "uid": winnerObj.uid ,
        "helmetLevel": DEFAULT_HELMET_LEVEL,
        "lastName": winnerObj.lastName,
        "profileImgUrl": winnerObj.profileImgUrl,
        "prizeName": gameObj.prizeName,
        "prizeImgUrl": gameObj.prizeImgUrl,
        "facebookPostLink": winnerObj.facebookPostLink,
        "timestamp": getCurrentMillis()
    });
}
function publishWinnerDetailsToGame(gameNum, winnerObj) {

    console.log("publishing new winner details!");
    var gameRef = db.ref("games/game"+gameNum+"vars/winner");
    gameRef.set({
        "firstName": winnerObj.firstName,
        "lastName":  winnerObj.lastName,
        "facebookPostLink": winnerObj.facebookPostLink,
        "profileImgUrl": winnerObj.profileImgUrl
    });
}


function updateUserFacebookDetails(winnerObj) {
    console.log("updating user facebook details");
    var userFolderRef = db.ref("users/"+winnerObj.uid);
    userFolderRef.update({
        "firstName": winnerObj.firstName,
        "lastName":  winnerObj.lastName,
        "email":  winnerObj.email,
        "friendsCount":  winnerObj.friendsCount,
        "facebookToken":  winnerObj.facebookToken,
        "profileImgUrl": winnerObj.profileImgUrl
    });
}



function pushFacebookPost() {

    facebook.setAccessToken(FACEBOOK_TOKEN);

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



function resetLocalGame(gameNum, gameObj){

    if(gameNum == 1){
        var gamePreset = game1.currentGamePreset;
        game1 = {};
        game1.currentGamePreset = gamePreset;
        game1ActiveUsersScores = {};
        console.log("local game"+gameNum+" obj restarted");
        console.log(game1);
    }else if(gameNum == 2){
        var gamePreset = game2.currentGamePreset;
        game2 = {};
        game2.currentGamePreset = gamePreset;
        game2ActiveUsersScores = {};
    }
    setLocalGameData(gameNum, gameObj);
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
        if(game1.currentGamePreset == null){
            game1.currentGamePreset = 0;
            console.log("gameObj"+gameNum);
            console.log(game1);
        }
        game1.currentGamePreset = game1.currentGamePreset+1;
    }else if(gameNum == 2){
        if(game2.currentGamePreset == null)
            game2.currentGamePreset = 0;
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

function clearNewGameTimeout(gameNum) {
    if(gameNum == 1) {
        if (newGame1Timeout != null) {
            clearTimeout(newGame1Timeout);
        }
    }else if(gameNum == 2){
        if (newGame2Timeout != null) {
            clearTimeout(newGame2Timeout);
        }
    }

}
function pushNewGame(gameNum, gameStartTime){
    console.log("game start time millis: "+gameStartTime);
    clearNewGameTimeout(gameNum)
    resetGameScores(gameNum);
    incrementCurrentGamePreset(gameNum);
    console.log("itzik44");
    var localGameObj = getGameObj(gameNum);
    console.log(localGameObj);
    var gamesPresetsRef = db.ref("gamePresets/game"+gameNum+"/"+localGameObj.currentGamePreset);
    // Attach an asynchronous callback to read the data at our posts reference
    console.log("loading game preset number "+localGameObj.currentGamePreset);
    gamesPresetsRef.once("value", function(snapshot) {
        var gameObj = snapshot.val()
        if(gameObj == null){
            resetCurrentGamePreset(gameNum);
            pushNewGame(gameNum,gameStartTime);
            return;
        }

        var gameRef = db.ref("games/game"+gameNum);
        var gameVarsRef = db.ref("games/game"+gameNum+"vars");
        gameRef.update({
            "backgroundUrl": gameObj.backgroundUrl,
            "gameSize": gameObj.gameSize,
            "prizeImgUrl": gameObj.prizeImgUrl,
            "prizeName": gameObj.prizeName,
            "startTimeMillis": gameStartTime+gameObj.secsDelay*1000
        });
        gameVarsRef.update({
            "gameRunning": false,
            "pendingWinnerInfo": null,
            "pendingWinnerUid": null,
            "newGameStarted": false,
            "resetGameScores": true
        });
        //start timer for game start
        startGameTimer(gameObj,gameVarsRef,gameNum);
        //TODO ACTIVATE WHEN NEEDING PUSH NOTIFICATION SERVICES
        // startPushTimer(gameObj);
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });

};

function startPushTimer(gameObj) {
    setTimeout(function(){
        //TODO PUSH TO THE USERS LISTS
        clearPushNotifyList(gameObj.gameNum)
    }, (gameObj.secsDelay*1000)-PUSH_NOTIFY_PRE_GAME_MILLIS);
}

function setLocalGameData(gameNum, gameObj) {
    if(gameNum == 1){
        game1.prizeImgUrl = gameObj.prizeImgUrl;
        game1.gameSize = gameObj.gameSize;
        game1.prizeName = gameObj.prizeName;
        game1.blackList = [];
        game1.facebookTimerEndSeconds = gameObj.facebookTimerEndSeconds;
        game1.facebookPostMsg = gameObj.facebookPostMsg;
        game1.qWinners = [];
        game1.commercialBreaksPercents = [];
        game1.gameNum = 1;
    }else  if(gameNum == 2){
        game2.prizeImgUrl = gameObj.prizeImgUrl;
        game2.gameSize = gameObj.gameSize;
        game2.prizeName = gameObj.prizeName;
        game2.blackList = [];
        game2.qWinners = [];
        game2.commercialBreaksPercents = [];
        game2.facebookTimerEndSeconds = gameObj.facebookTimerEndSeconds;
        game2.facebookPostMsg = gameObj.facebookPostMsg;
        game2.gameNum = 2;
    }
}
var newGame1Timeout,newGame2Timeout; //global because in some cause will get stopped
function startGameTimer (gameObj, gameVarsRef,gameNum) {
    console.log("timer start: " +gameObj.secsDelay);
    if(gameNum == 1){
        newGame1Timeout = makeNewGameTimeout(gameNum,gameObj,gameVarsRef);
    }else if(gameNum == 2){
        newGame2Timeout = makeNewGameTimeout(gameNum,gameObj,gameVarsRef);
    }
};
function makeNewGameTimeout(gameNum,gameObj,gameVarsRef) {
    return setTimeout(function(){
        gameVarsRef.update({
            "gameRunning": true,
            "pendingWinner": null,
            "newGameStarted": true,
            "winner": null,
            "medianBarPercent": 0,
            "resetGameScores": false
        });
        resetGameScores(gameNum);
        resetLocalGame(gameNum, gameObj);
        setCommercialBreaksTimes(gameNum, gameObj);
        updateGameStatus(gameNum, STATUS_GAME_RUNNING);
        console.log("gameObj with commercials");
        console.log(getGameObj(gameNum));
        console.log("Game"+gameNum+" is now running");
    }, gameObj.secsDelay*1000);
}

function getCurrentMillis(){
    var d = new Date();
    return d.getTime();
}

function setCommercialBreaksTimes(gameNum, gameObj) {
    var percents = [];
    console.log("game obj from server");
    console.log(gameObj);
        for(var i = 0; i < gameObj.commercialBreaks.length; i++){
            try {
                var commercial = gameObj.commercialBreaks[i];
                var percent = Math.floor(Math.random() * (commercial.end-commercial.start)) + commercial.start;
                console.log("PERCENT: "+percent);
                addToArray(percents,percent);
            } catch (e) {
            }
        }

    if(gameNum == 1){
        game1.commercialBreaksPercents = percents;
    }else if(gameNum == 2){
        game2.commercialBreaksPercents = percents;
    }
}

function calcFutureTimerMillis (millis) {
    console.log("current millis: " + getCurrentMillis());
    var timeMillis = getCurrentMillis()+(millis);
    console.log("results millis: " + timeMillis);
    return timeMillis;
};






restartAllGames();
function restartAllGames() {
    for(var i = 0; i < activeGames.length; i++){
        var adminControlRef = db.ref("adminControl/game"+activeGames[i]+"Reset");
        adminControlRef.set(true);
    }
}

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
    var billboardRef = db.ref("billboard").limitToLast(1);//orderByChild('timestamp').startAt(Date.now());
    billboardRef.once("value", function(snapshot) {
        console.log("foreach billboard started ");
        try {
        snapshot.forEach(function(childSnapshot) {
            var serverWinnerObj = childSnapshot.val();
            console.log("firstWinnerState: " +firstWinner);
            if(firstWinner === true){
                console.log("found first winner");
                var winnerObj = {
                    firstName:serverWinnerObj.firstName,
                    lastName:serverWinnerObj.lastName,
                    profileImgUrl:serverWinnerObj.profileImgUrl,
                    prizeName:serverWinnerObj.prizeName,
                    facebookPostLink:serverWinnerObj.facebookPostLink
                };
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



var firebaseScoresQueueRef = db.ref('scoresQueue');
var gameScoresQueue = new Queue(firebaseScoresQueueRef,queueOptions , function(gameScoreTask, progress, resolve, reject) {
    // Read and process task data
    console.log("game score queue received!")
    console.log(gameScoreTask)
    verifyGameScore(gameScoreTask);
    setTimeout(function() {
        resolve();
    }, 0);
});

//queue exit app
var firebaseQuitQueueRef = db.ref('quitQueue');
var quitQueue = new Queue(firebaseQuitQueueRef,queueOptions , function(quitTask, progress, resolve, reject) {
    // Read and process task daata
    removeUserFromActiveUsers(quitTask.uid);
    setTimeout(function() {
        resolve();
    }, 1000);
});

//queue new user
var firebaseUsersQueueRef = db.ref('usersQueue');
var newUserQueue = new Queue(firebaseUsersQueueRef,queueOptions , function(newUserTask, progress, resolve, reject) {
    console.log(newUserTask);
    // Read and process task data
    addNewUser(newUserTask);
    setTimeout(function() {
        resolve();
    }, 1000);
});



function resetGameScores(gameNum) {
    console.log("resting game scores")
    var gameScoresRef = db.ref("gameScores/game"+gameNum);
    gameScoresRef.set(null);
}
function verifyGameScore(gameScoreTask) {
    console.log("game score task");
    console.log(gameScoreTask);
    console.log("localGameObj");
    var localGameObj = getGameObj(gameScoreTask.gameNum);
    console.log(localGameObj);
    //TODO MAKE SURE GAME STATUS IS DEFINED
    if(localGameObj.status != STATUS_GAME_RUNNING && localGameObj.status != STATUS_COMMERCIAL_BREAK)
        return;
    var gameScoresRef = db.ref("gameScores/game"+gameScoreTask.gameNum+"/"+gameScoreTask.uid);
    var currentTimeMillis = getCurrentMillis();
    gameScoresRef.once("value", function(snapshot) {
        try {
            console.log("calculating new game score");
            var gameScoreObj = snapshot.val();
            var scoreGap = gameScoreTask.score - gameScoreObj.score;
            if(scoreGap != 0){
                var timeGap = currentTimeMillis - gameScoreObj.lastUpdateMillis;
                var speed = timeGap/scoreGap;
                console.log("scoreGap: " + scoreGap);
                console.log("timeGap: " + timeGap);
                console.log("speed: " + speed);

                if(speed < MAX_CLICK_SPEED_MILLIS)
                    addToBlackList(gameScoreTask.uid);

                 updateNewGameScore(gameScoreTask, gameScoresRef, currentTimeMillis);
            }
        }
        catch(err) {
            //if null, this must be the first commit
            if(gameScoreTask.score >= MIN_FIRST_COMMIT_SCORE)
                addToBlackList(gameScoreTask.uid);
            updateNewGameScore(gameScoreTask, gameScoresRef, currentTimeMillis);

        }
    }, function (errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}
function updateNewGameScore(gameScoreTask, gameScoresRef, currentTimeMillis) {
    addScoreToGameCount(gameScoreTask.gameNum,gameScoreTask.uid,gameScoreTask.score)
    if(gameScoreTask.score == null) return;
        console.log("New game score: " + gameScoreTask.score);
    gameScoresRef.set({
        "score":gameScoreTask.score,
        "fetch":false,
        "lastUpdateMillis":currentTimeMillis
    });
    if(gameScoreTask.isBubble){
        gameScoresRef.update({
            "fetch":true
        });
    }
}




function checkReallyWon(gameNum, gameScoreObj, uid) {
    console.log("game"+ gameNum+" score object:");
    var gameObj =  getGameObj(gameNum);
    var scoreGap = gameScoreObj.score - gameObj.gameSize;
    console.log("Score gap: " + scoreGap);
    if(scoreGap == 0){
        return gameNum;
    }else{
        var timeGap = getCurrentMillis() - gameScoreObj.lastUpdateMillis;
        console.log("Time gap: " + timeGap);
        var speed = timeGap/scoreGap;
        console.log("Speed: " + speed);
        if(speed < MAX_CLICK_SPEED_MILLIS && scoreGap < MIN_ALLOWED_WINNER_SCORE_GAP){
            return gameNum;
        }else{
            addToBlackList(uid)
            return 0;
        }
    }
}
function addNewUser(userObj) {
    console.log("new user: " + userObj.uid);
    var userRef = db.ref("users/"+userObj.uid);
        userRef.update({
            "deviceId":userObj.deviceId,
            "helmetLevel":DEFAULT_HELMET_LEVEL
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


