'use strict';

const Web3 = require('web3');
const solc = require('solc');
const fs = require('fs');

const dir = __dirname;

var fields = ["id", "isVerified", "hash", "addedAt"];
var houseFields = ["houseId", "street", "zipCode", "city", "country"];

let contractName = 'Woningpas';
let addressContract = null
try {
  addressContract = fs.readFileSync(`${dir}/${contractName}.address`).toString()
  console.log('Using contract at address "' + addressContract + '"')
} catch(e) {
  console.log('No contract address yet')
}

//Address of the node
var url = "https://e0vp6l0egw:lt32IHCYpL4rJuBlXHFD-oCTcxABbR96Bh0qaV2FLgE@e0qztrawvi-e0q2xif8zj-rpc.eu-central-1.kaleido.io";
console.log(`1. Connecting to target node: ${url}`);
let web3 = new Web3(new Web3.providers.HttpProvider(url));

if(process.argv.length === 3 && process.argv[2] === 'deploy') {
  deploy()
}

function getContract(deploy) {
  let tsSrc = fs.statSync(`${dir}/${contractName}.sol`);
  let tsBin;

  try {
    tsBin = fs.statSync(`${dir}/${contractName}.bin`);
  } catch (err) {
    console.log("Compiled contract does not exist. Will be generated.");
  }

  let compiled;
  if (!tsBin || tsSrc.mtimeMs > tsBin.mtimeMs) {
    // source file has been modified since the last compile
    let data = fs.readFileSync(`${dir}/${contractName}.sol`);
    compiled = solc.compile(data.toString(), 1);
    fs.writeFileSync(`${dir}/${contractName}.bin`, JSON.stringify(compiled));
  } else {
    compiled = JSON.parse(fs.readFileSync(`${dir}/${contractName}.bin`).toString());
  }

  let contract = compiled.contracts[`:${contractName}`];
  let abi = JSON.parse(contract.interface);
  let bytecode = '0x' + contract.bytecode;

  // address is optional
  let ret = new web3.eth.Contract(abi, addressContract);
  if (deploy) {
    // this is a new deployment, build the deploy object
    ret = ret.deploy({
      data: bytecode,
      arguments: [10]
    });
  }

  return ret;
}

async function getAccount() {
  let accounts = await web3.eth.personal.getAccounts();
  if (!accounts || accounts.length === 0) {
    console.error("Can't find accounts in the target node");
    process.exit(1);
  }

  return accounts[0];
}

function deploy() {
  return new Promise(function(resolve, reject) {
    getAccount().then((account) => {
      console.log(`\tFound account in the target node: ${account}`);

      let theContract = getContract(true);

      let params = {
        from: account,
        gasPrice: 0,
        gas: 5e6
      };

      console.log('2. Deploying smart contract');
      theContract.send(params)
      .on('error', (err) => {
        console.error('Failed to deploy the smart contract. Error: ' + err);
        reject('Failed to deploy the smart contract. Error: ' + err)
      })
      .then((newInstance) => {
        // smart contract deployed, ready to invoke it
        addressContract = newInstance._address
        console.log(`\tSmart contract deployed, ready to take calls at "${newInstance._address}"`);
        fs.writeFileSync(`${dir}/${contractName}.address`, newInstance._address);
        resolve(addressContract)
      });
    });
  })
}

//Check if file is validated
//By giving the id of the document and the house.
function isVerified(fileId, houseId, privateKey, res, error, success) {
  var ret = getContract();
  console.log("isVerified");
  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);
  ret.methods.isVerified(fileId, houseId).call({
    from: acc.address,
    gas: 5e6
  }).then(function(result) {
    console.log(result);
    success(res, {
      "validated": result
    })
  }).catch(function(error) {
    console.log(error)
    error(res, "Error with isVerified")
  })
}

//Validate a document
async function setVerification(owner, fileId, houseId, privateKey, res, error, success) {
  console.log("setVerification");
  var ret = getContract();
  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  let tx_builder = ret.methods.setVerification(owner, fileId, houseId);

  let encoded_tx = tx_builder.encodeABI();
  let transactionObject = {
    gas: 500000,
    data: encoded_tx,
    from: acc.address,
    to: addressContract
  };
  web3.eth.accounts.signTransaction(transactionObject, acc.privateKey, function(err, signedTx) {
    if (err) {
      console.log(err);
      // handle error
      error(res, "Error with setVerification")
    } else {
      web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('receipt', function(receipt) {
          console.log(receipt);
          success(res, {
            "validated": true
          })
        });
    };
  })
}

async function createAccount() {
  let account = await web3.eth.accounts.create();
  console.log("Create account");
  console.log(account);
  web3.eth.accounts.wallet.add(account)
  return account;
}

async function addHouse(street, zipCode, city, country, houseId, privateKey, res, error, success) {
  console.log("addHouse");
  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  var ret = getContract();

  let tx_builder = ret.methods.addHouse(street, zipCode, city, country, houseId);

  let encoded_tx = tx_builder.encodeABI();
  let transactionObject = {
    gas: 5000000,
    data: encoded_tx,
    from: acc.address,
    to: addressContract
  };
  web3.eth.accounts.signTransaction(transactionObject, acc.privateKey, function(err, signedTx) {
    if (err) {
      console.log(err);
      // handle error
      error(res, "Error with addHouse")
    } else {
      web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('receipt', function(receipt) {
          success(res, {
            "message": "Success"
          })
        });
    };
  })
}

async function addDocument(hash, privateKey, fileId, houseId, time, res, error, success) {
  console.log("addDocument");

  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  var ret = getContract();


  let tx_builder = ret.methods.addDocument(fileId, false, hash, houseId, time);

  let encoded_tx = tx_builder.encodeABI();
  let transactionObject = {
    gas: 5000000,
    data: encoded_tx,
    from: acc.address,
    to: addressContract
  };
  web3.eth.accounts.signTransaction(transactionObject, acc.privateKey, function(err, signedTx) {
    if (err) {
      console.log(err);
      // handle error
      error(res, "Error with addDocument")
    } else {
      web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('receipt', function(receipt) {
          success(res, {
            "id": fileId
          })
        });
    };
  })
}

async function getHouse(index, privateKey, callback) {
  var ret = getContract();
  console.log("getHouses");

  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);
  console.log(index);
  ret.methods.getHouse(index).call({
    from: acc.address,
    gas: 5e6
  }).then(function(result) {
    callback(result);
  }).catch(function(error) {
    console.log(error)
    error(res, "Error with getHouses")
  })
}

//Get the nulber of house that a owner has
async function getNbHouses(res, error, privateKey, callback) {

  var ret = getContract();
  console.log("getNbHouses");

  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  ret.methods.getHouseNumber().call({
    from: acc.address,
    gas: 5e6
  }).then(function(result) {
    callback(result);

  }).catch(function(error) {
    console.log(error)
    error(res, "Error with getNbHouses")
  })
}

//Get tge number of document that a owner has for a giving house.
async function getNbDoc(res, error, privateKey, houseId, callback) {

  var ret = getContract();
  console.log("getNbDoc");

  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  ret.methods.getDocumentNumber(houseId).call({
    from: acc.address,
    gas: 5e6
  }).then(function(result) {
    console.log(result);
    callback(result);

  }).catch(function(error) {
    console.log(error)
    error(res, "Error with getNbDoc")
  })
}

//Get the document at a giving index
async function getDocument(index, privateKey, houseId, callback) {
  var ret = getContract();
  console.log("getDocs");

  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);
  console.log(index);
  ret.methods.getDocument(houseId, index).call({
    from: acc.address,
    gas: 5e6
  }).then(function(result) {
    callback(result);
  }).catch(function(error) {
    console.log(error)
    error(res, "Error with getHouses")
  })
}

//Get a house with his id
async function getHouseWithId(houseId, privateKey, res, success, error) {
  var ret = getContract();
  console.log("getHouse avec ID");

  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  console.log(houseId);
  ret.methods.getHouseWithId(houseId).call({
    from: acc.address,
    gas: 5e6
  }).then(function(result) {
    console.log("iciicic");
    console.log(result);
    if (result[0] == '') {
      error(res, "No item for this id");
    } else {
      success(res, parseResult(result, houseFields));
    }

  }).catch(function(error) {
    console.log(error)
    error(res, "Error with getHouse avec id")
  })

}

//Get a specific document with his id.
async function getDocumentWithId(owner, houseId, documentId, privateKey, res, success, error) {
  var ret = getContract();
  console.log("getDoc avec ID");

  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  ret.methods.getDocumentWithId(owner, documentId, houseId).call({
    from: acc.address,
    gas: 5e6
  }).then(function(result) {
    if (result[0] === '') {
      error(res, "No item for this id");
    } else {
      success(res, parseResult(result, fields));
    }
  }).catch(function(error) {
    console.log(error)
    error(res, "Error with getDoc avec id")
  })
}

function parseResult(data, fields) {
  let index = 0;
  var result = [];
  let prettyResult = {};

  for (var j in data) {
    prettyResult[fields[j]] = data[j];
    if (fields[j]==="addedAt"){
      prettyResult[fields[j]] = parseInt(data[j]);
    }
  }
  return prettyResult;
}

async function transferOwnership(from, to, houseId, privateKey, res, success, error) {
  console.log("transferOwnership");
  var ret = getContract();
  let acc = web3.eth.accounts.privateKeyToAccount(privateKey);

  console.log("Addresse from to ");
  console.log(from);
  console.log(to);

  let tx_builder = ret.methods.transferOwnership(from, to, houseId);
  let encoded_tx = tx_builder.encodeABI();

  let transactionObject = {
    gas: 5000000,
    data: encoded_tx,
    from: acc.address,
    to: addressContract
  };

  web3.eth.accounts.signTransaction(transactionObject, acc.privateKey, function(err, signedTx) {
    if (err) {
      console.log(err);
      error(res, "Error with transferOwnership")
    } else {
      web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('receipt', function(receipt) {
          success(res, receipt);
        });
    };
  })


}



module.exports.deploy = deploy;
module.exports.setVerification = setVerification;
module.exports.isVerified = isVerified;
module.exports.createAccount = createAccount;
module.exports.addHouse = addHouse;
module.exports.getHouse = getHouse;
module.exports.getNbHouses = getNbHouses;
module.exports.getDocument = getDocument;
module.exports.getNbDoc = getNbDoc;
module.exports.addDocument = addDocument;
module.exports.getHouseWithId = getHouseWithId;
module.exports.getDocumentWithId = getDocumentWithId;
module.exports.transferOwnership = transferOwnership;
module.exports.parseResult = parseResult;
