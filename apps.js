/**
 * Created by zvi on 8/8/2016.
 */
var express = require('express');
var app = express();
var requestIp = require('request-ip');
var firebase = require('firebase');
var multer  = require('multer')
var upload = multer({ dest: 'uploads/' })
var fs = require('fs');
const PORT = 9450;

/*

firebase.initializeApp({
    serviceAccount: "./TEST3-c610d475e23d.json",
    databaseURL: "https://test3-7d832.firebaseio.com"
    databaseAuthVariableOverride: {
        uid: "server_worker_1"
    }
});

/!**
 * This service worker should be the olny one getting access to database locations used by him
 * Example:
 * {
  "rules": {
    "serverControl": {
      ".read": "auth.uid === 'server_worker_1'",
      ".write": "auth.uid === 'server_worker_1'"
    }
  }
}
 *!/
var db = firebase.database();


ITZIK!
*/


//start the node server
app.set('port', process.env.PORT || PORT);

app.get('/' ,function (req,res) {
    var clientIp = requestIp.getClientIp(req);
    res.send('frillappss\' server\nWhere all good things start.' + "\nYour ip: +" + clientIp);
});
app.listen(app.get('port'),function(){
    console.log('server started on port itzik '+ app.get('port'));
});

// File input field name is simply 'file'

app.post('/file_upload', upload.single('png'), function (req, res, next) {
        console.log('image file received!');
})





/*
 var type = upload.single('recfile')
app.post('/file_upload', type, function(req, res) {
    console.log("on post image");
    var targetPath = req.file.path;

    var target_path = 'file_upload/' + req .file.originalname;
    var src = fs.createReadStream(tmp_path);

    var dest = fs.createWriteStream(target_path);
    src.pipe(dest);
    src.on('end', function() { res.render('complete'); });
    src.on('error', function(err) { res.render('error'); });*/

/*   var file = __dirname + '/' + req.file.filename;
    fs.rename(req.file.path, file, function(err) {
        if (err) {
            console.log(err);
            res.send(500);
        } else {
            res.json({
                message: 'File uploaded successfully',
                filename: req.file.filename
            });
            var stats =
            console.log("file name: " + req.file.filename);
        }
    });
});*/





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
