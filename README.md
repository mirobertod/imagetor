# imagetor

This function download PDF, PNG or JPEG file from the URL provided in the request, save the original file in a bucket on Google Cloud Storage, resize and apply watermark (only on images) where desidered.
This function can also delete a file previously saved.

This is a Google Cloud Function. (Node.js 10)  
This function accepts only POST requests.  
The trigger is an HTTPS endpoint.  
This function does **NOT** create the relative buckets if not present.  
You can easily deploy this function via [gcloud functions deploy](https://cloud.google.com/sdk/gcloud/reference/functions/deploy).


For develop this Google Cloud Functions you may need to use the [Functions Framework for Node.js](https://www.npmjs.com/package/@google-cloud/functions-framework).  
Remember to have the credentials.json in the root directory of the project.  
**You have to configure** your variables via <em>config.json</em> (See examples section).

### Features
+ Save original PDF document
+ Save original image
+ Save resized image
+ Overlay watermark based on local images
+ Supported input image format: JPEG, PNG
+ Supported output image format: JPEG, WebP
+ base64 decode for source image
+ multiple resize same request
+ Supported special headers in the request to download the image

### Changelog

#### v1.3.0
+ Node.js 10
+ Modified extension accepted in the request. jpg to jpeg
+ Bugfix. Response not properly handled.
+ Add support to webp format

### Examples

#### Example config.json (Only token property is required)
~~~~
{
    "mybucketname": {
        "token": "myauthtoken",
        "watermark": "mywatermarkpath",
        "auth_header": {
            "Authorization": "Bearer myauthtoken"
        }
    },
    "mysecondbucket": {
        "token": "mysecondtoken"
    }
}
~~~~

#### Delete image
Request:
~~~~
{
    "action": "del",
    "bucket": "mybucketname",
    "authToken": "myauthtoken",
    "relativePath": "test/ori.jpg"
}
~~~~
Expected response:
~~~~
{
    "OK": "deleted"
}
~~~~

#### Save image without resizing and without watermark
Request:
~~~~
{
    "url": "https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg",
    "action": "add",
    "bucket": "mybucketname",
    "extension": "jpeg",
    "authToken": "myauthtoken",
    "originalImageRelativePath": "test/ori.jpg",
    "base64Format": true,
    "watermark": false
}
~~~~
Expected response:
~~~~
{
    "OK": [
        {
            "url": "https://storage.googleapis.com/mybucketname/test/ori.jpg"
        }
    ]
}
~~~~

#### Save image with resizing and watermark
Request:
~~~~
{
    "url": "https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg",
    "action": "add",
    "bucket": "mybucketname",
    "extension": "jpeg",
    "authToken": "myauthtoken",
    "originalImageRelativePath": "test/ori.jpg",
    "base64Format": true,
    "watermark": true,
    "watermarkPosition": "center",
    "files": [
    {
        "width": 1154,
        "height": 739,
        "relativePath": "test/image1.jpg"
    },
    {
        "width": 1154,
        "height": 749,
        "relativePath": "test/image2.jpg"
    },
    {
        "width": 1154,
        "height": 759,
        "relativePath": "test/image3.jpg"
    }
    ]
}

~~~~
Expected response:
~~~~
{
    "OK": [
        {
            "url": "https://storage.googleapis.com/mybucketname/test/ori.jpg"
        }
    ]
}
~~~~