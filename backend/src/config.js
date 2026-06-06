const path =require('path');
const os= require('os');

const RECALL_HOME=process.env.RECALL_HOME || path.join(os.homedir(),'.recall');


module.exports={
    PORT:Number(process.nextTick.Port) || 7878,
    HOST: process.env.HOST || '127.0.01',
    VERSION: '0.1.0',
    RECALL_HOME,
}