var async = require('async');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var gm = require('gm').subClass({imageMagick: true});
var path = require('path');
var URLEncoder = require('urlencode');

var sizeConfig = [
  //company avatar
  {
    postfix: 'thumb_square_sm',
    width: 80,
    height: 80,
    type: 'resize_to_fill'
  },
  //profile background
  {
    postfix: 'common_md',
    width: 750,
    height: 380,
    type: 'resize_to_fill'
  },
  //avatar user
  {
    postfix: 'thumb_square_md',
    width: 220,
    height: 220,
    type: 'resize_to_fill'
  },
  //plan attachment
  {
    postfix: 'preview_md',
    width: 230,
    height: 150,
    type: 'resize_to_fill'
  },
  {
    postfix: 'common_lg',
    width: 1280,
    height: 800,
    type: 'resize_to_fit'
  }
];

exports.handler = function(event, context) {
  var record = event.Records[0];
  var srcBucket = record.s3.bucket.name;
  var dstBucket = 'wecudos-resize';
  var srcKey = URLEncoder.decode(record.s3.object.key, "UTF-8");
  var imageExt = path.extname(srcKey);
  var imageName = path.basename(srcKey, imageExt);
  var dstFolderName = "";

  if (!imageExt) {
    console.error('unable to infer image type for key ' + srcKey);
    return context.fail();
  }

  if (imageExt != ".jpg" && imageExt != ".jpeg" && imageExt != ".png") {
    console.log('skipping non-image ' + srcKey);
    return context.fail();
  }

  async.waterfall([
    function download(next) {
      s3.getObject({
          Bucket: srcBucket,
          Key: srcKey
        },
        next);
    },
    function tranform(response, next) {
      async.map(sizeConfig, resize, function(err, mapped) {
        next(err, mapped);
      });

      function resize(config, callback) {
        gm(response.Body)
          .size(function(err, size) {
            if(err){
              next(err);
            }
            var width = config.width;
            var height = config.height;
            var self = this;

            var gm_object = (function(){
              if (config.type == 'resize_to_fill') {
                return self.resize(width, height, '^')
                  .gravity("Center")
                  .crop(width, height, 0, 0);
              } else if (config.type == 'resize_to_fit') {
                return self.resize(width, height);
              }
            })();

            gm_object
              .toBuffer('PNG', function(err, buffer) {
                if (err) {
                  callback(err);
                }
                else {
                  var obj = config;
                  obj.contentType = 'image/png';
                  obj.data = buffer;
                  obj.dstKey = imageName + '/' + config.postfix + '.png';
                  callback(null, obj);
                }
              });
            });
        }
  },
  function upload(items, next) {
    async.each(items,
      function(item, callback) {
        s3.putObject({
        Bucket: dstBucket,
        Key: item.dstKey,
        Body: item.data,
        ContentType: item.contentType
        }, callback);
      },
      function(err) {
        next(err);
      });
  }
], function(err) {
    if (err) {
      console.error(
        'Unable to resize ' + srcBucket + '/' + srcKey +
        ' and upload to ' + dstBucket + '/' + dstFolderName +
        ' due to an error: ' + err
      );
    } else {
      console.log(
      'Successfully resized ' + srcBucket + '/' + srcKey +
      ' and uploaded to ' + dstBucket + '/'+dstFolderName+'[postFix].jpg'
      );
      context.done();
    }
  });

};
