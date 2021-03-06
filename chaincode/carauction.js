/* Copyright 2018 IBM All Rights Reserved.
 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at 
		http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.*/

'use strict';

const shim = require('fabric-shim');

let Chaincode = class {

  async Init(stub) { //is called when the Smart Contract is instantiated
    return shim.success();
  }

  async Invoke(stub) {
    let ret = stub.getFunctionAndParameters();    
    let method = this[ret.fcn];
    if (!method) {
      throw new Error('Received unknown function ' + ret.fcn + ' invocation');
    }
    try {
      let payload = await method(stub, ret.params);
      return shim.success(payload);
    } catch (err) {
      return shim.error(err);
    }
  }

  async initLedger(stub, args) { //It can be thought of as a constructor for the network
    let member1 = {};
    member1.balance = 5000;
    member1.firstName = 'Amy';
    member1.lastName = 'Williams';

    let member2 = {};
    member2.balance = 5000;
    member2.firstName = 'Billy';
    member2.lastName = 'Thompson';

    let member3 = {};
    member3.balance = 5000;
    member3.firstName = 'Tom';
    member3.lastName = 'Werner';

    let vehicle = {};
    vehicle.owner = 'memberA@acme.org';

    let vehicleListing = {};
    vehicleListing.reservePrice = 3500;
    vehicleListing.description = 'Arium Nova';
    vehicleListing.listingState = 'FOR_SALE';
    vehicleListing.offers = '';
    vehicleListing.vehicle = '1234';

    await stub.putState('memberA@acme.org', Buffer.from(JSON.stringify(member1)));
    await stub.putState('memberB@acme.org', Buffer.from(JSON.stringify(member2)));
    await stub.putState('memberC@acme.org', Buffer.from(JSON.stringify(member3)));
    await stub.putState('1234',             Buffer.from(JSON.stringify(vehicle)));
    await stub.putState('ABCD',             Buffer.from(JSON.stringify(vehicleListing)));
  }

  async query(stub, args) { //Query the state of the blockchain by passing a key
    let query = args[0];
    let queryAsBytes = await stub.getState(query); //get the car from chaincode state
    if (!queryAsBytes || queryAsBytes.toString().length <= 0) {
      throw new Error('key' + ' does not exist: ');
    }
    console.info('query response: ' + queryAsBytes.toString());
    return queryAsBytes;
  }

  async createVehicle(stub, args) { //Create a vehicle object in the state 
    let car = {
      owner: args[1]
    };
    await stub.putState(args[0], Buffer.from(JSON.stringify(car)));
  }

  async createVehicleListing(stub, args) { // Create a vehicle listing object in the state  
    let vehicleListing = {
      reservePrice: args[1],
      description: args[2],
      listingState: args[3],
      offers: args[4],
      vehicle: args[5]
    };
    await stub.putState(args[0], Buffer.from(JSON.stringify(vehicleListing)));
  }

  async createMember(stub, args) { //Create a member object in the state  
    let member = {
      firstName: args[1],
      lastName: args[2],
      balance: args[3]
    };
    await stub.putState(args[0], Buffer.from(JSON.stringify(member)));
  }

  async makeOffer(stub, args) { //Create a offer object in the state, and add it to the array of offers for that listing
    let offer = {
      bidPrice: args[0],
      listing: args[1],
      member: args[2]
    };

    //get reference to listing, to add the offer to the listing later
    let listingAsBytes = await stub.getState(args[1]); //enhance
    if (!listingAsBytes || listingAsBytes.toString().length <= 0) {
      throw new Error('listing does not exist');
    }
    let listing = JSON.parse(listingAsBytes);

    //get reference to vehicle, to update it's owner later
    let vehicleAsBytes = await stub.getState(listing.vehicle);
    if (!vehicleAsBytes || vehicleAsBytes.toString().length <= 0) {
      throw new Error('vehicle does not exist');
    }
    let vehicle = JSON.parse(vehicleAsBytes);

    //get reference to member to ensure enough balance in their account to make the bid
    let memberAsBytes = await stub.getState(offer.member); 
    if (!memberAsBytes || memberAsBytes.toString().length <= 0) {
      throw new Error('member does not exist: ');
    }
    let member = JSON.parse(memberAsBytes);

    //check to ensure bidder has enough balance to make the bid
    if (member.balance < offer.bidPrice) {
      throw new Error('The bid is higher than the balance in this account!');
    }

    //check to ensure bidder can't bid on own item
    if (vehicle.owner == offer.member) {
      throw new Error('owner cannot bid on own item!');
    }

    //if array is null, we have to create an empty one
    if (!listing.offers) {
      listing.offers = [];
    }
    listing.offers.push(offer);
    
    await stub.putState(args[1], Buffer.from(JSON.stringify(listing)));
  }

  async closeBidding(stub, args) { //Close the bidding for a vehicle listing and choose the highest bid as the winner  
    let listingKey = args[0];

    //check if listing exists
    let listingAsBytes = await stub.getState(listingKey);
    if (!listingAsBytes || listingAsBytes.toString().length <= 0) {
      throw new Error('listing does not exist: ');
    }
    let listing = JSON.parse(listingAsBytes);
    listing.listingState = 'RESERVE_NOT_MET';
    let highestOffer = null;

    if (listing.offers && listing.offers.length > 0) {//close bidding if there are offers
      
      listing.offers.sort(function (a, b) {//use builtin JS array sort method that returns highest value at the first index
        return (b.bidPrice - a.bidPrice);
      });
      highestOffer = listing.offers[0];

      if (highestOffer.bidPrice >= listing.reservePrice) { //bid must be higher than reserve price

        let buyerAsBytes = await stub.getState(highestOffer.member);
        if (!buyerAsBytes || buyerAsBytes.toString().length <= 0) {
          throw new Error('buyer does not exist: ');
        }
        let buyer = JSON.parse(buyerAsBytes);

        let vehicleAsBytes = await stub.getState(listing.vehicle); 
        if (!vehicleAsBytes || vehicleAsBytes.toString().length <= 0) {
          throw new Error('vehicle does not exist: ');
        }
        var vehicle = JSON.parse(vehicleAsBytes);
        
        let sellerAsBytes = await stub.getState(vehicle.owner); 
        if (!sellerAsBytes || sellerAsBytes.toString().length <= 0) {
          throw new Error('vehicle does not exist: ');
        }
        let seller = JSON.parse(sellerAsBytes);
        
        let highOfferBidPrice = parseInt(highestOffer.bidPrice, 10);        
        let buyerBalance = parseInt(buyer.balance, 10);
        let sellerBalance = parseInt(seller.balance, 10);
        
        buyer.balance  = buyerBalance  - highOfferBidPrice;
        seller.balance = sellerBalance + highOfferBidPrice;
        
        let oldOwner = vehicle.owner;
        vehicle.owner = highestOffer.member;
        listing.offers = null;
        listing.listingState = 'SOLD';

        await stub.putState(highestOffer.member,  Buffer.from(JSON.stringify(buyer)));      
        await stub.putState(oldOwner,             Buffer.from(JSON.stringify(seller)));
        await stub.putState(listingKey,           Buffer.from(JSON.stringify(listing))); 

      }
    }

    if (highestOffer) {
      await stub.putState(listing.vehicle, Buffer.from(JSON.stringify(vehicle)));
    } else { 
      throw new Error('offers do not exist: '); 
    }

  }

};

shim.start(new Chaincode()); 
