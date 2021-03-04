import Utils from "./Utils.js";
export default class Batch {
    batchNumber;
    expiryForDisplay;
    version = 1;
    versionLabel = "";
    serialNumbers ;
    defaultSerialNumber = "0";
    bloomFilterSerialisation;
    recalled = false;
    serialCheck = false;
    incorectDateCheck = true;
    expiredDateCheck = true;
    recalledMessage = "";
    defaultMessage = "";

    constructor(batch) {
        if (typeof batch !== undefined) {
            for (let prop in batch) {
                this[prop] = batch[prop];
            }
        }
        if (!this.batchNumber) {
            this.batchNumber = Utils.generateSerialNumber(6);
        }
    }

    generateViewModel() {
        return {label: this.batchNumber, value: this.batchNumber}
    }

    validate() {
        if (!this.batchNumber) {
            return 'Batch number is mandatory field';
        }
        if (!this.expiryForDisplay) {
            return  'Expiration date is a mandatory field.';
        }
        return undefined;
    }

    addSerialNumbers(arr){
        let crypto = require("opendsu").loadAPI("crypto");
        let bf;
        if(this.bloomFilterSerialisation){
            bf = crypto.createBloomFilter(this.bloomFilterSerialisation);
        }else{
            bf = crypto.createBloomFilter({ estimatedElementCount: arr.length, falsePositiveTolerance: 0.000001 });
        }
        arr.forEach( sn => {
            bf.insert(sn);
        });
        this.bloomFilterSerialisation = bf.bloomFilterSerialisation();
    }
    appnedSerialNumbrs(arr){
        let crypto = require("opendsu").loadAPI("crypto");
        let bf = crypto.createBloomFilter({ estimatedElementCount: arr.length, falsePositiveTolerance: 0.000001 });
    }
}
