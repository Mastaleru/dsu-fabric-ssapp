const {WebcController} = WebCardinal.controllers;
import Product from '../models/Product.js';
import Languages from "../models/Languages.js";
import constants from '../constants.js';
import getSharedStorage from '../services/SharedDBStorageService.js';
import UploadTypes from "../models/UploadTypes.js";
import utils from "../utils.js";
import Utils from "../models/Utils.js";
const arrayBufferToBase64 = require("epi-utils").getMappingsUtils().arrayBufferToBase64;

const PRODUCT_STORAGE_FILE = constants.PRODUCT_STORAGE_FILE;
const PRODUCT_IMAGE_FILE = constants.PRODUCT_IMAGE_FILE;
const LEAFLET_ATTACHMENT_FILE = constants.LEAFLET_ATTACHMENT_FILE;
const SMPC_ATTACHMENT_FILE = constants.SMPC_ATTACHMENT_FILE;

export default class ManageProductController extends WebcController {
  constructor(...props) {
    super(...props);
    this.setModel({});


    const mappings = require("epi-utils").loadApi("mappings");
    const epiUtils = require("epi-utils").getMappingsUtils();
    const LogService = require("epi-utils").loadApi("services").LogService
    let logService = new LogService(this.DSUStorage);

    //TODO extract if... look into MangeProductController
    this.holderInfo = {domain: "epi", subdomain: "default",
      userDetails:{
        company:"CopmanyName",
        username:"customUsername"
      },

    };
    this.mappingEngine = mappings.getEPIMappingEngine(this.DSUStorage, {
      holderInfo: this.holderInfo,
      logService: logService
    });


    this.storageService = getSharedStorage(this.DSUStorage);
    this.logService = new LogService(this.DSUStorage);

    let state = this.history.location.state;
    this.gtin = typeof state !== "undefined" ? state.gtin : undefined;
    this.model.languages = {
      label: "Language",
      placeholder: "Select a language",
      options: Languages.getListAsVM()
    };

    this.model.languageTypeCards = [];

    this.onTagClick("cancel", () => {
      this.navigateToPageTag("products");
    })

    this.onTagClick("delete-language-leaflet", (model, target, event) => {
      let eventDdata = target.firstElementChild.innerText.split('/');
      this.model.languageTypeCards = this.model.languageTypeCards.filter(lf => !(lf.type.value === eventDdata[1] && lf.language.value === eventDdata[0]));
    });

    this.onTagClick("add-language-leaflet", (event) => {
      this.addLanguageTypeFilesListener(event)
    });

    const ensureHolderCredential = () => {


      this.model.submitLabel = this.model.product.isCodeEditable ? "Save Product" : "Update Product";
      // dsuBuilder.ensureHolderInfo((err, holderInfo) => {
      //     if (!err && holderInfo) {
      //         this.model.product.manufName = holderInfo.userDetails.company;
      //         this.model.username = holderInfo.userDetails.username;
      //     } else {
      //         printOpenDSUError(createOpenDSUErrorWrapper("Invalid configuration detected!", err));
      //         this.showErrorModalAndRedirect("Invalid configuration detected! Configure your wallet properly in the Holder section!", "products");
      //     }
      // })
    };

    if (typeof this.gtin !== "undefined") {
      this.storageService.getRecord(constants.LAST_VERSION_PRODUCTS_TABLE, this.gtin, (err, product) => {
        this.model.product = new Product(product);
        this.model.product.version++;
        this.model.product.previousVersion = product.version;
        this.model.product.isCodeEditable = false;
        this.model.product.batchSpecificVersion = false;
        this.getInheritedCards(product, product.version, (err, inheritedCards) => {
          if (err) {
            this.showErrorModalAndRedirect("Failed to get inherited cards", "products");
          }
          this.model.languageTypeCards = inheritedCards;
        });
        ensureHolderCredential();
      });
    } else {
      this.model.product = new Product();
      ensureHolderCredential();
    }

    this.on("product-photo-selected", (event) => {
      this.productPhoto = event.data;
    });

    this.on('openFeedback', (e) => {
      this.feedbackEmitter = e.detail;
    });

    this.model.onChange("product.gtin", (event) => {

    })

    this.onTagClick("add-product", async (event) => {
      let product = this.model.product.clone();

      if (!this.isValid(product)) {
        return;
      }

      this.createWebcModal({
        disableExpanding: true,
        disableClosing: true,
        disableFooter: true,
        modalTitle: "Info",
        modalContent: "Saving product..."
      });

      product.photo =  this.getImageAsBase64(this.productPhoto||this.model.product.photo);

      let message = {
        messageType:"Product",
        product:{}
      };

      let productPropsMapping= epiUtils.productDataSourceMapping;

      for(let prop in product){
        if(typeof productPropsMapping[prop] !== "undefined"){
          message.product[productPropsMapping[prop]] = product[prop];
        }
        else{
          message.product[prop] = product[prop];
        }
      }
      message.product.photo = product.photo;


      console.log(this.model.languageTypeCards);

      try{
        let undigestedMessages = await this.mappingEngine.digestMessages([message]);
        console.log(undigestedMessages);
        if(undigestedMessages.length === 0){

          //process photo

          let newPhoto = typeof this.productPhoto !== "undefined";

          let addPhotoMessage = {
            inherited: !newPhoto,
            messageType: "ProductPhoto",
            productCode: message.product.productCode,
            senderId: this.model.username,
          }
          if (newPhoto) {
            addPhotoMessage.imageData = arrayBufferToBase64(this.productPhoto);
          }

          undigestedMessages = await this.mappingEngine.digestMessages([addPhotoMessage])
          console.log("Photo undigested messages", undigestedMessages);

          //process leaflet & cards smpc

          let cardMessages = [];

          for (let i = 0; i < this.model.languageTypeCards.length; i++) {
            let card = this.model.languageTypeCards[i];
            let cardMessage = {
              inherited:card.inherited,
              productCode: message.product.productCode,
              language: card.language.value,
              messageType: card.type.value
            }

            if (!card.inherited) {
              cardMessage.xmlFileContent = await $$.promisify(this.getXMLFileContent.bind(this))(card.files);
              cardMessage.otherFilesContent = await $$.promisify(this.getOtherCardFiles.bind(this))(card.files)
            }

            cardMessages.push(cardMessage);
          }
          let undigestedLeafletMessages = await this.mappingEngine.digestMessages(cardMessages);
          console.log(undigestedLeafletMessages);

        }
        else{
          //show an error?
        }

      }
      catch (e){
        console.log(e);
      }
      this.hideModal();
      this.navigateToPageTag("products");


      // this.buildProductDSU(product, (err, keySSI) => {
      //     if (err) {
      //         this.hideModal();
      //         printOpenDSUError(createOpenDSUErrorWrapper("Product DSU build failed!", err))
      //         return this.showErrorModalAndRedirect("Product DSU build failed.", "products");
      //     }
      //
      //     console.log("Product DSU KeySSI:", keySSI);
      //
      //     let finish = (err) => {
      //         if (err) {
      //             this.hideModal();
      //             printOpenDSUError(createOpenDSUErrorWrapper("Product keySSI failed to be stored in your wallet.", err))
      //             return this.showErrorModalAndRedirect("Product keySSI failed to be stored in your wallet.", "products");
      //         }
      //
      //         this.storageService.commitBatch((err, res) => {
      //             if (err) {
      //                 printOpenDSUError(createOpenDSUErrorWrapper("Failed to commit batch. Concurrency issues or other issue", err))
      //             }
      //             this.hideModal();
      //             this.navigateToPageTag("products");
      //         });
      //     }
      //     if (typeof product.keySSI === "undefined") {
      //         return this.buildConstProductDSU(product.gtin, keySSI, (err, gtinSSI) => {
      //             if (err) {
      //                 this.hideModal();
      //                 printOpenDSUError(createOpenDSUErrorWrapper("Failed to create an Immutable Product DSU!", err))
      //                 return this.showErrorModalAndRedirect("An Immutable DSU for the current GTIN already exists!", "products");
      //             }
      //
      //             product.keySSI = keySSI;
      //             console.log("ConstProductDSU GTIN_SSI:", gtinSSI);
      //             this.persistProduct(product, finish);
      //         });
      //     }
      //
      //     this.persistProduct(product, finish);
      // });
    });
  }

  getXMLFileContent(files, callback){
    let xmlFiles = files.filter((file) => file.name.endsWith('.xml'));

    if (xmlFiles.length === 0) {
      return callback(new Error("No xml files found."))
    }
    this.getBase64FileContent(xmlFiles[0],callback)
  }

  async getOtherCardFiles(files, callback){
    let anyOtherFiles = files.filter((file) => !file.name.endsWith('.xml'))

    let filesContent = [];
    for(let i = 0; i<anyOtherFiles.length; i++){
      let file = anyOtherFiles[i];
      filesContent.push({
        filename:file.name,
        fileContent: await $$.promisify(this.getBase64FileContent)(file)
      })
    }
    callback(undefined,filesContent);
  }


  getBase64FileContent(file, callback){
    let fileReader = new FileReader();

    fileReader.onload = function (evt) {
      let arrayBuffer = fileReader.result;
      let base64FileContent = arrayBufferToBase64(arrayBuffer);
      callback(undefined, base64FileContent);
    }

    fileReader.readAsArrayBuffer(file);
  }




  getImageAsBase64(imageData) {
    if (typeof imageData === "string") {
      return imageData;
    }
    if (!(imageData instanceof Uint8Array)) {
      imageData = new Uint8Array(imageData);
    }
    let base64Image = utils.bytesToBase64(imageData);
    base64Image = `data:image/png;base64, ${base64Image}`;
    return base64Image;
  }


  addLanguageTypeFilesListener(event) {
    const languages = {
      label: "Language",
      placeholder: "Select a language",
      options: Languages.getListAsVM()
    };
    const types = {
      label: "Type",
      placeholder: "Select a type",
      options: UploadTypes.getListAsVM()
    };
    this.model.modalData = {
      title: "Choose language and type of upload",
      acceptButtonText: 'Accept',
      denyButtonText: 'Cancel',
      languages: languages,
      types: types,
      product: {
        language: "en",
        type: "leaflet"
      },
      fileChooser: {
        accept: "directory",
        "event-name": "uploadLeaflet",
        label: "Upload files",
        "list-files": true
      }
    }
    this.on("uploadLeaflet", (event) => {
      this.model.modalData.files = event.data;
    });
    this.showModalFromTemplate('select-language-and-type-modal', () => {
      if (this.typeAndLanguageExist(this.model.modalData.product.language, this.model.modalData.product.type)) {
        return alert('This language and type combo already exist.');
      }
      let selectedLanguage = Languages.getListAsVM().find(lang => lang.value === this.model.modalData.product.language);
      let selectedType = UploadTypes.getListAsVM().find(type => type.value === this.model.modalData.product.type);
      let card = this.generateCard(false, selectedType.value, selectedLanguage.value);
      card.files = this.model.modalData.files;
      this.model.languageTypeCards.push(card);
    }, () => {
      return
    }, {model: this.model});
  }

  typeAndLanguageExist(language, type) {
    return this.model.languageTypeCards.findIndex(lf => lf.type.value === type && lf.language.value === language) !== -1;
  }

  filesWereProvided() {
    return this.model.languageTypeCards.filter(lf => lf.files.length > 0).length > 0;
  }

  isValid(product) {

    if (product.version === 1) {
      if (!this.filesWereProvided()) {
        this.showErrorModal("Cannot save the product because a leaflet was not provided.");
        return false;
      }
    }

    let validationResult = product.validate();
    if (Array.isArray(validationResult)) {
      for (let i = 0; i < validationResult.length; i++) {
        let err = validationResult[i];
        this.showErrorModal(err);
      }
      return false;
    }
    return true;
  }

  buildConstProductDSU(gtin, productDSUKeySSI, callback) {
    dsuBuilder.getTransactionId((err, transactionId) => {
      if (err) {
        return callback(err);
      }
      dsuBuilder.setGtinSSI(transactionId, dsuBuilder.holderInfo.domain, dsuBuilder.holderInfo.subdomain, gtin, (err) => {
        if (err) {
          return callback(err);
        }

        let keySSIInstance = productDSUKeySSI;
        if (typeof keySSIInstance === "string") {
          const keySSISpace = require("opendsu").loadAPI("keyssi");
          keySSIInstance = keySSISpace.parse(keySSIInstance);
        }
        let sReadProductKeySSI = keySSIInstance.derive();
        dsuBuilder.mount(transactionId, "/product", keySSIInstance.getIdentifier(), (err) => {
          if (err) {
            return callback(err);
          }

          //TODO: derive a sReadSSI here...
          dsuBuilder.buildDossier(transactionId, callback);
        });
      });
    });
  }
  //TODO: ************TO BE REMOVED************
  buildProductDSU(product, callback) {
    dsuBuilder.getTransactionId((err, transactionId) => {
      if (err) {
        return callback(err);
      }

      if (product.version > 1) {
        this.updateProductDSU(transactionId, product, callback);
      } else {
        this.createProductDSU(transactionId, product, callback);
      }
    });

  }

  //TODO: ************TO BE REMOVED************
  createProductDSU(transactionId, product, callback) {
    const keyssiSpace = require("opendsu").loadAPI("keyssi");
    const hint = JSON.stringify({bricksDomain: dsuBuilder.holderInfo.subdomain});

    keyssiSpace.createSeedSSI(dsuBuilder.holderInfo.domain, undefined, hint, (err, keySSI)=>{
      if(err){
        return callback(err);
      }

      dsuBuilder.setKeySSI(transactionId, keySSI.getIdentifier(), {headers:{"x-force-dsu-create":true}}, (err)=>{
        if (err) {
          return callback(err);
        }

        this.addProductFilesToDSU(transactionId, product, (err, keySSI) => {
          if (err) {
            return callback(err);
          }

          callback(undefined, keySSI);
        });
      });
    });
  }

  //TODO: ************TO BE REMOVED************
  updateProductDSU(transactionId, product, callback) {
    dsuBuilder.setKeySSI(transactionId, product.keySSI, (err) => {
      if (err) {
        return callback(err);
      }

      this.addProductFilesToDSU(transactionId, product, callback);
    });
  }


  uploadFile(transactionId, filename, file, callback) {
    dsuBuilder.addFileDataToDossier(transactionId, filename, file, (err, data) => {
      if (err) {
        return callback(err);
      }
      callback(undefined, data);
    });
  }

  getInheritedCards(product, version, callback){
    const resolver = require("opendsu").loadAPI("resolver");
    resolver.loadDSU(product.keySSI, (err, productDSU) => {
      if (err) {
        return callback(err);
      }

      let languageTypeCards = [];
      //used temporarily to avoid the usage of dsu cached instances which are not up to date
      productDSU.load(err => {
        if (err) {
          return callback(err);
        }

        productDSU.listFolders(this.getPathToLeaflet(version), (err, leaflets) => {
          if (err) {
            return callback(err);
          }

          productDSU.listFolders(this.getPathToSmPC(version), (err, smpcs) => {
            if (err) {
              return callback(err);
            }
            leaflets.forEach(leafletLanguageCode => {
              languageTypeCards.push(this.generateCard(true, "leaflet", leafletLanguageCode));
            })
            smpcs.forEach(smpcLanguageCode => {
              languageTypeCards.push(this.generateCard(true, "smpc", smpcLanguageCode));
            });

            callback(undefined, languageTypeCards);
          });
        });
      });
    });
  }

  generateCard(inherited, type, code){
    let card = {
      inherited: inherited,
      type: {value: type},
      language: {value: code}
    };
    card.type.label = UploadTypes.getLanguage(type);
    card.language.label = Languages.getLanguage(code);
    return card;
  }

  getPathToLeaflet(version){
    return `${this.getPathToVersion(version)}/leaflet`;
  }

  getPathToSmPC(version){
    return `${this.getPathToVersion(version)}/smpc`;
  }

  getPathToVersion(version){
    return `/product/${version}`;
  }

  getAttachmentPath(version, attachmentType, language){
    return `${this.getPathToVersion(version)}/${attachmentType}/${language}`;
  }

  addProductFilesToDSU(transactionId, product, callback) {
    const basePath = this.getPathToVersion(product.version);
    product.leaflet = LEAFLET_ATTACHMENT_FILE;
    const productStorageFile = basePath + PRODUCT_STORAGE_FILE;

    //step #1 managing product photo
    let imageProcessing = ()=>{
      const imagePath = basePath + PRODUCT_IMAGE_FILE;

      let finishedImageProcessing = (newImageAvailable)=>{
        if(newImageAvailable){
          //TODO: maybe we should remove this information from the product JSON before saving into DSU
          product.photo = this.getPathToVersion(product.version)+PRODUCT_IMAGE_FILE;
        }
        processInformationFiles();
      }

      //if the user selected a photo we need to added into dsu
      if(typeof this.productPhoto !== "undefined"){
        //TODO: maybe we should remove this information from the product JSON before saving into DSU
        product.photo = imagePath;
        dsuBuilder.addFileDataToDossier(transactionId, basePath + PRODUCT_IMAGE_FILE, this.productPhoto, (err)=>{
          if(err){
            return callback(err);
          }
          finishedImageProcessing(true);
        });
      }else{
        //if there was a photo on the previous product we need to copy to the new version
        if (product.hasPhoto()) {
          const src = this.getPathToVersion(product.version - 1) + PRODUCT_IMAGE_FILE;
          const dest = imagePath;
          //TODO: maybe we should remove this information from the product JSON before saving into DSU
          product.photo = imagePath;
          return dsuBuilder.copy(transactionId, src, dest, (err)=>{
            if(err){
              return callback(err);
            }
            finishedImageProcessing(true);
          });
        }

        //??? should we remove any default photo from the product ???
        //product.photo = "";
        finishedImageProcessing();
      }
    }

    //step #2 managing leaflet and smpc files updates
    let processInformationFiles = (err) => {
      if (err) {
        return callback(err);
      }

      let languageTypeCards = this.model.languageTypeCards;

      let processCard = (cardIndex) => {
        let languageAndTypeCard = languageTypeCards[cardIndex];
        if (!languageAndTypeCard) {
          return finishingStep();
        }

        if (!languageAndTypeCard.inherited && languageAndTypeCard.files.length === 0) {
          processCard(cardIndex + 1);
        }

        let uploadPath = this.getAttachmentPath(product.version, languageAndTypeCard.type.value, languageAndTypeCard.language.value);

        if (!languageAndTypeCard.inherited) {
          this.uploadAttachmentFiles(transactionId, uploadPath, languageAndTypeCard.type.value, languageAndTypeCard.files, doneProcessingCard);
        } else {
          const src = this.getAttachmentPath(product.version - 1, languageAndTypeCard.type.value, languageAndTypeCard.language.value);
          const dest = this.getAttachmentPath(product.version, languageAndTypeCard.type.value, languageAndTypeCard.language.value);
          dsuBuilder.copy(transactionId, src, dest, doneProcessingCard);
        }

        function doneProcessingCard(err) {
          if (err) {
            return callback(err);
          }
          if (cardIndex < languageTypeCards.length) {
            processCard(cardIndex + 1)
          } else {
            return finishingStep();
          }
        }
      }

      return processCard(0);
    };

    //step #3 saving product into dsu as JSON and build DSU
    let finishingStep = ()=>{
      dsuBuilder.addFileDataToDossier(transactionId, productStorageFile, JSON.stringify(product), (err) => {
        if (err) {
          return callback(err);
        }

        dsuBuilder.buildDossier(transactionId, callback);
      });
    };

    //start of the flow
    imageProcessing();
  }

  uploadAttachmentFiles(transactionId, basePath, attachmentType, files, callback) {
    if (files === undefined || files === null) {
      return callback(undefined, []);
    }
    let xmlFiles = files.filter((file) => file.name.endsWith('.xml'))
    if (xmlFiles.length === 0) {
      return callback(new Error("No xml files found."))
    }
    let anyOtherFiles = files.filter((file) => !file.name.endsWith('.xml'))
    let responses = [];
    const uploadTypeConfig = {
      "leaflet": LEAFLET_ATTACHMENT_FILE,
      "smpc": SMPC_ATTACHMENT_FILE
    }

    this.uploadFile(transactionId, basePath + uploadTypeConfig[attachmentType], xmlFiles[0], (err, data) => {
      if (err) {
        return callback(err);
      }
      responses.push(data);

      let uploadFilesRecursive = (file) => {
        this.uploadFile(transactionId, basePath + "/" + file.name, file, (err, data) => {
          if (err) {
            return callback(err);
          }
          responses.push(data);
          if (anyOtherFiles.length > 0) {
            uploadFilesRecursive(anyOtherFiles.shift())
          } else {
            return callback(undefined, responses);
          }
        });
      }

      if (anyOtherFiles.length > 0) {
        return uploadFilesRecursive(anyOtherFiles.shift());
      }
      return callback(undefined, responses);
    });
  }

  //TODO: ************TO BE REMOVED************
  persistProduct(product, callback) {
    product.gs1Data = `(01)${product.gtin}(21)${Utils.generateNumericID(12)}(10)${Utils.generateID(6)}(17)111111`;
    if (typeof this.gtin === "undefined") {
      this.gtin = product.gtin;
    }

    product.creationTime = utils.convertDateTOGMTFormat(new Date());
    this.logService.log({
      logInfo: product,
      username: this.model.username,
      action: "Created product",
      logType: 'PRODUCT_LOG'
    }, () => {

      // this.DSUStorage.call("mountDSU", `/${product.gtin}`, product.keySSI, (err) => {
      this.saveImage(product, this.productPhoto||this.model.product.photo);
      this.storageService.insertRecord(constants.PRODUCTS_TABLE, `${this.gtin}|${product.version}`, product, () => {
        this.storageService.getRecord(constants.LAST_VERSION_PRODUCTS_TABLE, this.gtin, (err, prod) => {
          if (err || !prod) {
            product.initialVersion = product.version;
            this.storageService.insertRecord(constants.LAST_VERSION_PRODUCTS_TABLE, this.gtin, product, callback);
          } else {
            this.storageService.updateRecord(constants.LAST_VERSION_PRODUCTS_TABLE, this.gtin, product, callback);
          }
        });
      });
    });
    // });
  }
}
