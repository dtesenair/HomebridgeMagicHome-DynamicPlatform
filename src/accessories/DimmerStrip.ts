import { clamp, convertHSLtoRGB, convertRGBtoHSL } from '../magichome-interface/utils';
import { HomebridgeMagichomeDynamicPlatformAccessory } from '../PlatformAccessory';
import { CharacteristicEventTypes } from 'homebridge';
import type { CharacteristicValue,CharacteristicSetCallback, CharacteristicGetCallback} from 'homebridge';

const COMMAND_POWER_ON = [0x71, 0x23, 0x0f];
const COMMAND_POWER_OFF = [0x71, 0x24, 0x0f];

export class DimmerStrip extends HomebridgeMagichomeDynamicPlatformAccessory {
  constructor(platform,
    accessory,
    config){
    super(platform,
      accessory,
      config);


    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Magic Home')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueId)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.modelNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.lightVersion)
      .getCharacteristic(this.platform.Characteristic.Identify)
      .on(CharacteristicEventTypes.SET, this.identifyLight.bind(this));       // SET - bind to the 'Identify` method below

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);


    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) ?? this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on(CharacteristicEventTypes.SET, this.setConfiguredName.bind(this));
    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this));               // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .on(CharacteristicEventTypes.SET, this.setBrightness.bind(this))        // SET - bind to the 'setBrightness` method below
      .on(CharacteristicEventTypes.GET, this.getBrightness.bind(this));       // GET - bind to the 'getBrightness` method below

    this.getState();

  }

  /**
   ** @getState
   * retrieve light's state object from transport class
   * once values are available, update homekit with actual values
   */
  async getState() {

    try {


      const state = await this.transport.getState(1000); //retrieve a state object from transport class showing light's current r,g,b,ww,cw, etc

      const brightness = state.color.red; //create local constant for brightness

      this.lightState.On = state.isOn;

      this.service.updateCharacteristic(this.platform.Characteristic.On, state.isOn);

      if(state.isOn){
        this.service.updateCharacteristic(this.platform.Characteristic.Brightness, brightness);
      }

      this.platform.log.debug('\nGetting state for Accessory: %o -- Type: %o \nOn: %o \nBrightness: %o \nBuffer Data: %o\n',  
        this.accessory.context.displayName,
        this.accessory.context.controllerType,
        state.isOn,
        brightness,
        state.debugBuffer);


    } catch (error) {
      this.platform.log.error('getState() error: ', error);
    }
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {


    this.lightState.On = value as boolean;
    this.send(this.lightState.On ? COMMAND_POWER_ON : COMMAND_POWER_OFF);

    this.platform.log.debug('Set Characteristic On -> %o for device: %o ', value, this.accessory.context.device.uniqueId);

    // you must call the callback function
    callback(null);
  }

  /**
   ** @getOn
   * instantly retrieve the current on/off state stored in our object
   * next call this.getState() which will update all values asynchronously as they are ready
   */
  getOn(callback: CharacteristicGetCallback) {

    const isOn = this.lightState.On;

    //update state with actual values asynchronously
    this.getState();

    this.platform.log.debug('Get Characteristic On -> %o for device: %o ', isOn, this.accessory.context.device.uniqueId);
    callback(null, isOn);
  }

  /*
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Hue
   */
  async setBrightness(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    // implement your own code to set the brightness
    this.lightState.Brightness = value as number;

    await this.setColor();
    this.platform.log.debug('Set Characteristic Brightness -> %o for device: %o ', value, this.accessory.context.device.uniqueId);

    // you must call the callback function
    callback(null);
  }
    
  async setColor() {

    //**** local variables ****\\
    const brightness = this.lightState.Brightness;
    
    this.send([0x31, brightness, 0x00, 0x00, 0x03, 0x01, 0x0F]); //8th byte checksum calculated later in send()

    
  }//setColor

  getBrightness(callback: CharacteristicGetCallback) {

    // implement your own code to check if the device is on
    const brightness = this.lightState.Brightness;

    // dont update the actual values from brightness, it is impossible to determine by rgb values alone
    //this.getState();

    this.platform.log.debug('Get Characteristic Brightness -> %o for device: %o ', brightness, this.accessory.context.device.uniqueId);
    this.getState();
    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, brightness);
  }
    
    
}