// Import dependencies
const imagetorVersion = require('./package.json').version;
const config = require('./config.json');
const {
    Storage
} = require('@google-cloud/storage');
const storage = new Storage({
    projectId: process.env.GCP_PROJECT
});
const Ajv = require('ajv');
const ajv = new Ajv({
    allErrors: true
});
const sharp = require('sharp');
const fileType = require('file-type');
const url = require('url')
const https = require('https');
const http = require('http');


// Define global variables
let req = {};
let res = {};
let bucketName = {};
let filesLength = {};

let extension = {};
let response = {};
let promises = [];


module.exports.imagetor = imagetor;


function errorHandler(err) {
    console.error(err);
    console.log('request is: ', req.body);
    res.status(500).json({
        "imagetorVersion": imagetorVersion,
        "date": new Date().toISOString().slice(0, 16),
        "error": err
    });
}

async function inputValidation() {

    const schemaAdd = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string"
                    //"format": "uri"
            },
            "action": {
                "type": "string",
                "pattern": "add"
            },
            "bucket": {
                "type": "string"
            },
            "extension": {
                "type": "string",
                "pattern": "jpeg|pdf|webp"
            },
            "authToken": {
                "type": "string"
            },
            "originalImageRelativePath": {
                "type": "string"
            },
            "base64Format": {
                "type": "boolean"
            },
            "watermark": {
                "type": "boolean",
                "default": false
            },
            "watermarkPosition": {
                "type": "string",
                "pattern": "center|southeast|southwest|northeast|northwest"
            },
            "files": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "width": {
                            "type": "number"
                        },
                        "height": {
                            "type": "number"
                        },
                        "relativePath": {
                            "type": "string"
                        }
                    },
                    "required": ["width", "height", "relativePath"]
                },
            },
        },
        "allOf": [{
            "if": {
                "properties": {
                    "extension": {
                        "const": "pdf"
                    }
                }
            },
            "then": {
                "properties": {
                    "files": false
                }
            }
        }, {
            "if": {
                "not": {
                    "properties": {
                        "watermark": {
                            "const": false
                        }
                    }
                }
            },
            "then": {
                "required": ["watermarkPosition"]
            }
        }],
        "additionalProperties": false,
        "required": ["url", "action", "bucket", "extension", "authToken", "originalImageRelativePath", "base64Format"]
    };

    const schemaDel = {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "pattern": "del"
            },
            "bucket": {
                "type": "string"
            },
            "authToken": {
                "type": "string"
            },
            "relativePath": {
                "type": "string"
            }
        },
        "additionalProperties": false,
        "required": ["action", "bucket", "authToken", "relativePath"]
    };

    if (req.method !== 'POST') {
        throw ('Method is not POST');
    }
    if (req.headers['content-type'] !== 'application/json') {
        throw ('Content-Type is not application/json');
    }

    if (req.body.action) {
        if (req.body.action === 'add') {
            let validate = ajv.compile(schemaAdd);
            let valid = validate(req.body);
            if (valid) return;
            else throw (ajv.errorsText(validate.errors))
        } else if (req.body.action === 'del') {
            let validate = ajv.compile(schemaDel);
            let valid = validate(req.body);
            if (valid) return;
            else throw (ajv.errorsText(validate.errors))
        }
    } else {
        throw ('Missing action properties')
    }

}

async function authValidation() {

    if (req.body.authToken === config[req.body.bucket].token) {
        return;
    } else {
        throw ('Token mismatch');
    }

}

function getResizeStream(imageHeight, imageWidth) {
    return new Promise((resolve, reject) => {

        if (bucketName.watermark) {
            reject('watermark does not exist')
        }

        if (req.body.watermark) {
            resizeImage =
                sharp()
                .resize(imageWidth, imageHeight)
                .overlayWith(config[bucketName].watermark, {
                    gravity: sharp.gravity[req.body.watermarkPosition]
                })
                .toFormat(extension);
        } else {
            resizeImage =
                sharp()
                .resize(imageWidth, imageHeight)
                .toFormat(extension)

            resolve(resizeImage)
        }

    })
}

function getUploadStream(filePathName) {
    return new Promise(resolve => {

        let contentType = "";

        switch (extension) {
            case 'jpeg':
                contentType = 'image/jpeg';
                break;
            case 'webp':
                contentType = 'image/webp';
                break;
            case 'pdf':
                contentType = 'application/pdf';
                break;
        }

        const writeStreamToCS =
            storage
            .bucket(bucketName)
            .file(filePathName)
            .createWriteStream({
                gzip: true,
                public: true,
                metadata: {
                    contentType: contentType,
                    cacheControl: process.env.CACHE_VALUE,
                },
            });

        resolve(writeStreamToCS)

    })
}

function decodeBase64(encodedStream) {
    return new Promise((resolve, reject) => {
        let rawData = '';
        encodedStream.on('data', (chunk) => {
            rawData += chunk
        });

        encodedStream.on('end', () => {
            try {
                const stream = require('stream');
                const buffer = new Buffer.from(rawData, 'base64');
                const decodedStream = new stream.Readable({
                    objectMode: true
                });
                decodedStream.push(buffer);
                decodedStream.push(null);
                resolve(decodedStream)
            } catch (err) {
                reject('Error during decoding to base64. Err: ' + err)
            }
        })

    })
}

function typeValidation(inputStream) {
    return new Promise((resolve, reject) => {

        inputStream.once('data', (chunk) => {
            if (fileType(chunk) === null) {
                reject('filetype invalid or request empty')
            } else if (fileType(chunk).ext !== 'jpg' && fileType(chunk).ext !== 'pdf' && fileType(chunk).ext !== 'png') {
                reject('filetype invalid')
            } else {
                inputStream.pause()
                inputStream.unshift(chunk)
                resolve(true)
            }
        });
    })
}

function downloadFile(fileUri) {
    return new Promise((resolve, reject) => {

        const parameters = {
            host: url.parse(fileUri).hostname,
            path: url.parse(fileUri).path,
            timeout: 10000
        };

        if (config[bucketName].auth_header) {
            parameters["headers"] = config[bucketName].auth_header
        }

        let httpLib = http
        if (/^https/.test(fileUri)) {
            httpLib = https
        }

        httpLib.get(parameters)
            .on('response', (inputStream) => {
                if (inputStream.statusCode !== 200) {
                    reject('Failed to download image. Code: ' + inputStream.statusCode)
                } else {
                    resolve(inputStream)
                }
            })
            .on('error', (err) => {
                reject('Failed to download image. Err: ' + err)
            })
    })
}

function sendResponse(responses) {
    response["OK"] = responses
    res.status(200).json(response)
}

function pipeStream(inputStream, resStream, upStream, filePathName) {
    return new Promise((resolve, reject) => {

        const baseUri = 'https://storage.googleapis.com/' + bucketName + '/';

        if (resStream === undefined) {
            inputStream
                .pipe(upStream)
                .on('error', err => {
                    reject('Error during uploading. Err: ' + err);
                })
                .on('finish', () => {
                    resolve({ "url": baseUri + filePathName })
                });
        } else {
            inputStream
                .pipe(resStream)
                .on('error', err => {
                    reject('Errore during resizing. Err: ' + err);
                })
                .pipe(upStream)
                .on('error', err => {
                    reject('Error during uploading. Err: ' + err);
                })
                .on('finish', () => {
                    resolve({ "url": baseUri + filePathName });
                })
        }
    })
}

async function actionAdd() {

    let inputStream = await downloadFile(req.body.url);

    if (req.body.base64Format) {
        try {
            inputStream = await decodeBase64(inputStream)
        } catch (err) {
            errorHandler('Error during decoding from base64. Err: ' + err)
        }
    }

    let typeIsValid = false
    try {
        typeIsValid = await typeValidation(inputStream)
    } catch (err) {
        errorHandler('MIME type not allowed. Err: ' + err)
    }

    if (typeIsValid) {

        let filePathName = req.body.originalImageRelativePath;

        let resStream = undefined;
        upStream = await getUploadStream(filePathName)
        promises.push(pipeStream(inputStream, resStream, upStream, filePathName))


        for (let index = 0; index < filesLength; index++) {
            let imageHeight = req.body.files[index].height;
            let imageWidth = req.body.files[index].width;
            let filePathName = req.body.files[index].relativePath;

            resStream = await getResizeStream(imageHeight, imageWidth);
            upStream = await getUploadStream(filePathName)
            promises.push(pipeStream(inputStream, resStream, upStream, filePathName))

        }

        Promise.all(promises)
            .then(responses => {
                sendResponse(responses)
            })
            .catch(err => {
                errorHandler(err)
            })
    }
}

async function actionDel() {
    let filePathName = req.body.relativePath;
    storage.bucket(bucketName).file(filePathName).delete()
        .then(() => {
            sendResponse(('Delete OK - path: ' + filePathName, {
                OK: "deleted"
            }))
        })
        .catch(err => {
            errorHandler('Error during deleting. Err: ' + err)
        })
}

function imagetor(myreq, myres) {
    req = myreq;
    res = myres;
    bucketName = (req.body.bucket) ? req.body.bucket : null;
    filesLength = (req.body.files) ? req.body.files.length : 0;
    extension = (req.body.extension) ? req.body.extension : null;
    response["OK"] = [];
    promises = []

    inputValidation()
        .then(() => authValidation()
            .then(() => {
                if (req.body.action.toLowerCase() === 'del') {
                    actionDel()
                }
                if (req.body.action.toLowerCase() === 'add') {
                    actionAdd()
                }
            })
            .catch((err) => {
                errorHandler(err)
            }))
        .catch((err) => {
            errorHandler(err)
        })

}