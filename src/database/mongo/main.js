'use strict';

module.exports = function (db, module) {
	module.flushdb = async function () {
		await db.dropDatabase();
	};

	module.emptydb = async function () {
		await db.collection('objects').deleteMany({});
		module.objectCache.resetObjectCache();
	};

	module.exists = async function (key) {
		if (!key) {
			return;
		}
		if (Array.isArray(key)) {
			const data = await db.collection('objects').find({ _key: { $in: key } }).toArray();
			var map = {};
			data.forEach(function (item) {
				map[item._key] = true;
			});

			return key.map(key => !!map[key]);
		}
		const item = await db.collection('objects').findOne({ _key: key });
		return item !== undefined && item !== null;
	};

	module.delete = async function (key) {
		if (!key) {
			return;
		}
		await db.collection('objects').deleteMany({ _key: key });
		module.objectCache.delObjectCache(key);
	};

	module.deleteAll = async function (keys) {
		if (!Array.isArray(keys) || !keys.length) {
			return;
		}
		await db.collection('objects').deleteMany({ _key: { $in: keys } });
		module.objectCache.delObjectCache(keys);
	};

	module.get = async function (key) {
		if (!key) {
			return;
		}

		const objectData = await db.collection('objects').findOne({ _key: key }, { projection: { _id: 0 } });

		// fallback to old field name 'value' for backwards compatibility #6340
		var value = null;
		if (objectData) {
			if (objectData.hasOwnProperty('data')) {
				value = objectData.data;
			} else if (objectData.hasOwnProperty('value')) {
				value = objectData.value;
			}
		}
		return value;
	};

	module.set = async function (key, value) {
		if (!key) {
			return;
		}
		var data = { data: value };
		await module.setObject(key, data);
	};

	module.increment = async function (key) {
		if (!key) {
			return;
		}
		const result = await db.collection('objects').findOneAndUpdate({ _key: key }, { $inc: { data: 1 } }, { returnOriginal: false, upsert: true });
		return result && result.value ? result.value.data : null;
	};

	module.rename = async function (oldKey, newKey) {
		await db.collection('objects').updateMany({ _key: oldKey }, { $set: { _key: newKey } });
		module.objectCache.delObjectCache([oldKey, newKey]);
	};

	module.type = function (key, callback) {
		db.collection('objects').findOne({ _key: key }, function (err, data) {
			if (err) {
				return callback(err);
			}
			if (!data) {
				return callback(null, null);
			}
			delete data.expireAt;
			var keys = Object.keys(data);
			if (keys.length === 4 && data.hasOwnProperty('_key') && data.hasOwnProperty('score') && data.hasOwnProperty('value')) {
				return callback(null, 'zset');
			} else if (keys.length === 3 && data.hasOwnProperty('_key') && data.hasOwnProperty('members')) {
				return callback(null, 'set');
			} else if (keys.length === 3 && data.hasOwnProperty('_key') && data.hasOwnProperty('array')) {
				return callback(null, 'list');
			} else if (keys.length === 3 && data.hasOwnProperty('_key') && data.hasOwnProperty('data')) {
				return callback(null, 'string');
			}
			callback(null, 'hash');
		});
	};

	module.expire = function (key, seconds, callback) {
		module.expireAt(key, Math.round(Date.now() / 1000) + seconds, callback);
	};

	module.expireAt = function (key, timestamp, callback) {
		module.setObjectField(key, 'expireAt', new Date(timestamp * 1000), callback);
	};

	module.pexpire = function (key, ms, callback) {
		module.pexpireAt(key, Date.now() + parseInt(ms, 10), callback);
	};

	module.pexpireAt = function (key, timestamp, callback) {
		timestamp = Math.min(timestamp, 8640000000000000);
		module.setObjectField(key, 'expireAt', new Date(timestamp), callback);
	};
};
