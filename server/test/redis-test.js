import { createClient } from 'redis';

const client = createClient({
    username: 'default',
    password: 'RZCgqlZ6AHG0mSCAEIiKjUtO26spWSLJ',
    socket: {
        host: 'redis-18902.crce276.ap-south-1-3.ec2.cloud.redislabs.com',
        port: 18902
    }
});

client.on('error', err => console.log('Redis Client Error', err));

await client.connect();

await client.set('foo', 'bar');
const result = await client.get('foo');
console.log(result) 

