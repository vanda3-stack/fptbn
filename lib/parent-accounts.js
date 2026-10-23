'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
async function schema(db){await db.query(`CREATE TABLE IF NOT EXISTS ot_parent_accounts (student_id INT PRIMARY KEY, password_hash VARCHAR(200) NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)}
async function hash(password){const salt=crypto.randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex')}
async function verify(password,stored){if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored||''))return false;const [salt,key]=stored.split(':');return crypto.timingSafeEqual(await scrypt(password,salt,64),Buffer.from(key,'hex'))}
module.exports={schema,hash,verify};
