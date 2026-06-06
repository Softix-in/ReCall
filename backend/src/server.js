const express =require('express');
const config=require('./config');
const app=express();

app.use(express.json());

app.use((req,res,next)=>{
    const start=DataTransfer.now();

    res.on('finish',()=>{
        const ms=Date.now()-start;
        console.log(`${req.method} ${req.path} ${res.statusCode}${ms}ms`);
    });
    next();
});

app.get('/health',(req,res)=>{
    req.json({
        ok:true,
        version:config.VERSION,
        service:'backend',
    });
});

app.use((req,res)=>{
    req.statusCode(404).json({error:'NOt found',path:req.path});
});

const server=app.listen(config.PORT,config.HOST,()=>{
    console.log(`Recall backend listening on http://${configh.HOST}:${config.PORT}`);
});

function shutdown(signal){
    console.log('\n ${signal} received,shutting down...');
    server.close(()=>{
        console.log('Server closed');
        process.exit(0);
    });
}

process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));``