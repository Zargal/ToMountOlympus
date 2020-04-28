// Display a list of things. May not have much of a purpose in the set-up, but may come in handy
function displayAll(displayables) {
    let result = "";
    for(let displayable of displayables){
        result += displayable + "<br>";
    }

    return result
}

function convertToString(list){
    let result = [];

    for(let item of list){
        result.push(item.toString());
    }

    return result;
}

// stolen from https://stackoverflow.com/questions/3115982/how-to-check-if-two-arrays-are-equal-with-javascript
function arraysEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function findInteriorArray(list, toFind){
    for(let thing of list){
        if(arraysEqual(thing, toFind)){
            return true;
        }
    }

    return false;
}

// Creates a drop-down box of options automatically - probably
function giveOptions(options, labelText){
    let select = document.createElement("select");
    select.name = "optionValues";
    select.id = "optionValues";

    options.forEach(function (value, i) {
        let option = document.createElement("option");
        option.value = i;
        option.innerHTML = i.toString() + "- " + value.toString();
        select.appendChild(option);
    });

    let label = document.createElement("label");
    label.innerHTML = labelText;
    label.id = "optionLabel";
    label.htmlFor = "optionValues";

    let submit = document.createElement("button");
    submit.innerHTML = "Submit selection";
    submit.id = "SubmitSelection";
    submit.name = "SubmitSelection";

    document.getElementById("options").appendChild(label).appendChild(select);
    document.getElementById("optionLabel").appendChild(submit);
}

// Experimental promise websocket architecture????????
function askForInput(prompt, pid, options) {
    let rid = request_id;
    socket.emit("Looking for Input", prompt, pid, options, rid);
    request_id++;

    return new Promise(function (resolve) {
        socket.on("input response to host", function (data) {
            if(data[1] === rid){
                resolve(data[0]);
            }
        });
    });
}

//Removes the first element of a certain value from an array
function remove(list, toRemove){
    let checkForRemoved = false;
    list = list.filter(function (value, index, arr) {
        let temp;
        if(value instanceof TextCard){
            temp = value.cid;
        }else{
            temp = value;
        }
        if(temp === toRemove && !checkForRemoved){
            checkForRemoved = true;
            return false;
        }else{
            return true;
        }
    });
    return list;
}

function print_well(message){
    socket.emit("add_message", message, g_id, info);
}

$(function () {
    socket.on("getting input", function (data) {
        requests.push(data);

        if(not_running){
            ask();
        }
    });

    function ask(){
        not_running = false;
        let data = requests[0];

        document.getElementById("options").style.visibility = "visible";
        let prompt = data["prompt"];
        let options = data["options"];
        giveOptions(options, prompt);
    }

    socket.on("got_card_data", function (data) {
        document.getElementById("cards").innerHTML = data;
    });

    $("#options").on('click', "#SubmitSelection", function(){
        socket.emit("Input response", $('#optionValues').val(), g_id, requests[0].rid);
        requests.shift();

        document.getElementById("optionValues").remove();
        document.getElementById("optionLabel").remove();
        if(Array.isArray(requests) && requests.length === 0) {
            document.getElementById("options").style.visibility = "hidden";
            not_running = true;
        }else{
            ask();
        }
    });
});


async function startGame(){
    if(all_players.length <= 1){
        alert("Not enough players");
    }else {
        let elem = document.getElementById("start");
        elem.parentNode.removeChild(elem);

        let itemData = await getSQLdata(1, info);

        let eventData = await getSQLdata(0, info);

        let playSpace = new TextBoard(itemData, eventData);

        let tempPlayers = all_players.slice(0, 4);

        let startMessage = "The game has started with ";

        for(let tempPlayer of tempPlayers){
            startMessage += "|n" + tempPlayer + "| "
        }

        print_well(startMessage);

        let tempRollOrder = [];

        do{
            tempRollOrder = [];
            for (let tempPlayer of tempPlayers) {
                let tempScore = getRndInt(1, 7);
                tempRollOrder.push(tempScore);

                print_well("|n" + tempPlayer + "| rolled a " + tempScore.toString());
            }
        } while((new Set(tempRollOrder)).size !== tempRollOrder.length);

        tempPlayers.sort(function(a, b){
            return tempRollOrder[tempPlayers.indexOf(b)] - tempRollOrder[tempPlayers.indexOf(a)];
        });

        let tempPlayerSelectOrder = Array.from(tempPlayers);

        tempPlayerSelectOrder.reverse();

        for(let tempPlayer of tempPlayerSelectOrder){
            let options = [];
            let passableOptions = [];

            for(let j=0; j<playSpace.width; j++){
                if(playSpace.get(0, j) === null || playSpace.get(0, j).occupied !== null){
                    // pass
                }else{
                    options.push(playSpace.get(0, j));
                    passableOptions.push(playSpace.get(0, j).toString());
                }
            }

            let choice = await askForInput("Choose a starting location:", tempPlayer, passableOptions);

            playSpace.addPlayer(tempPlayer, 0, options[choice].x);
        }

        playSpace.players.reverse();

        for(let player of playSpace.players){
            await player.draw(playSpace);
        }

        let index = 0;
        while(true){
            let {win, nextIndex} = await playSpace.players[index].turn(playSpace);
            if(win){
                break;
            }else{
                index = nextIndex;
            }
        }
    }
}


// Doesn't do much
class TextCard extends Card{
    constructor(data){
        super(data);
    }

    // Doesn't do much
    display(){
        print_well(this.toString());
    }
}

class TextDeck extends Deck{
    constructor(cards, events=false){
        super(cards, events);
    }

    async addToDiscard(card, playSpace, canBeStolen=true) {
        if(this.events){
            canBeStolen = false;
        }

        if(canBeStolen){
            // An order must be chosen. Might as well prioritize those lower down.
            let stolen = null;
            for(let playerGroup of playSpace.findInDirection()){
                for(let player of playerGroup){
                    let check = await player.checkAndAsk([21]);

                    if(check === null || check.cid !== 21){
                        // pass
                    } else if(check !== null && check.cid === 21){
                        stolen = player;
                        break;
                    }
                }

                if(stolen !== null){
                    break;
                }
            }

            if (stolen === null){
                super.addToDiscard(card, playSpace);
            } else{
                await stolen.give(card, playSpace);
                print_well(stolen.getName() + " used Theft to steal " + card.toString());
            }
        }else{
            super.addToDiscard(card, playSpace);
        }
    }

    async runEvent(currentTurnPlayer, playSpace){
        print_well("An event was activated!", g_id);

        let event = this.draw();

        print_well(event.toString());

        let normalDiscard = 0;

        switch(event.cid){
            // Dionysus' Alcoholism
            case 0:
                for(let playerGroup of playSpace.findInDirection()){
                    for(let player of playerGroup){
                        let check = await player.roll();
                        if(check % 2 === 0){
                            print_well(player.getName() + " avoided falling!");
                        } else{
                            await playSpace.directlyMove(player, 0, false);
                        }
                    }
                }
                break;

            // Poseidon's Wave
            case 1:
                for(let playerGroup of playSpace.findInDirection(3)){
                    for(let player of playerGroup){
                        await playSpace.directlyMove(player, 3);
                    }
                }
                break;

            // Mischief
            case 2:
                let amounts = [];
                let cards = [];

                for(let player of playSpace.players){
                    amounts.push(player.hand.length);
                    for(let index = 0; index < player.hand.length; index++){
                        cards.push(player.hand.pop());
                    }
                }

                shuffle(cards);

                for(let index = 0; index < playSpace.players.length; index++){
                    for(let count = 0; count < amounts[index]; count++){
                        await playSpace.players[index].give(cards.pop(), playSpace);
                    }
                }

                break;

            // Avalanche
            case 3:
                for(let playerGroup of playSpace.findInDirection()){
                    for(let player of playerGroup){
                        await playSpace.directlyMove(player);
                    }
                }
                break;

            // Aphrodite's Love
            case 4:
                let rolls = [];

                for(let player of playSpace.players){
                    rolls.push(await player.roll());
                }

                for(let index = 0; index < rolls.length - 1; index ++){
                    for(let index2 = index + 1; index2 < rolls.length; index2++){
                        if(rolls[index] === rolls[index2]){
                            if(rolls.slice(index2 + 1).includes(rolls[index])){
                                // pass
                            } else{
                                playSpace.players[index].swapPositions(playSpace.players[index2]);
                            }
                        }
                    }
                }

                break;

            // Zeus' Clouds
            case 5:
                for(let playerGroup of playSpace.findInDirection(2)){
                    for(let player of playerGroup){
                        if(player.plocation.y < playSpace.levels[3]){
                            await playSpace.directlyMove(player, 2);
                        }
                    }
                }

                break;

            // Hades' Curse
            case 6:
                let playerGroups = playSpace.findInDirection();

                for(let player of playerGroups[0]){
                    await playSpace.directlyMove(player);
                }

                playerGroups.reverse();

                for(let player of playerGroups[0]){
                    await playSpace.directlyMove(player, 2);
                }

                break;

            // Tartarus
            case 7:
                for(let player of playSpace.players){
                    for(let index = 0; index < player.hand.length; index++){
                        await playSpace.items.addToDiscard(player.discard(index), playSpace, false);
                    }
                }

                break;

            // Hermes' Missing Signposts
            case 8:
                playSpace.players.reverse();
                currentTurnPlayer.activeEffects.push([8.1, 1]);
                break;

            default:
                print_well("Not yet implemented.");
        }

        if(normalDiscard === 0){
            await this.addToDiscard(event, playSpace, false);
        }
    }
}

class TextPlayer extends Player{
    toString() {
        return this.getName() + " is at " + this.plocation.toString() + " with " + this.hand.length.toString() + " items."
    }

    getName(){
        return super.toString();
    }

    display(){
        print_well(this.toString());
    }

    displayHand(){
        let result;

        if (this.hand.length > 0){
            result = "Your current hand is: <br>";
            result += displayAll(this.hand);
        } else{
            result = "You have no items."
        }

        return result;
    }

    discard(index) {
        let result =  super.discard(index);
        socket.emit("refresh_card_data", this.pid, this.displayHand());
        return result;
    }

    async give(item, playSpace, activatesWine=false) {
        if(activatesWine && item.cid === 8){
            print_well(super.toString() + " has activated the effects of " + item.toString());

            if (await this.roll() % 2 === 0){
                print_well(super.toString() + " rolled an even number, avoiding the effects.");
            } else{
                playSpace.directlyMove(this, 0, false);
            }
        } else{
            print_well(super.toString() + " got a card.");
            super.give(item);
            socket.emit("refresh_card_data", this.pid, this.displayHand());
        }
    }

    async checkAndAsk(items){
        let available = this.check(items);
        let result = null;

        if(Array.isArray(available) && available.length > 0){
            let options = Array.from(available);
            options.push("Don't use an item.");

            let choice = await askForInput("Choose an item to use as a response:", this.pid, options);

            if(choice === options.length - 1){
                // pass
            } else{
                result = available[choice];
            }
        }

        return result;
    }

    async draw(playSpace, amount=1) {
        let cont = true;
        for(let itr=0; itr < amount; itr++){
            while(this.hand.length >= this.handLimit){
                let options = Array.from(convertToString(this.hand));

                if(this.hand.length === this.handLimit){
                    options.push("Don't draw");
                }

                let choice = await askForInput("You have too many cards. Choose a card to discard in order to draw:", this.pid, options);

                if(choice < this.hand.length){
                    await playSpace.items.addToDiscard(this.discard(choice), playSpace);
                } else{
                    cont = false;
                    break;
                }
            }
            if(cont) {
                super.draw(playSpace);
            }else{
                break;
            }
        }
    }

    async roll(boon = false, reroll = false) {
        let result = super.roll(boon);

        if (reroll){
            let choice = await askForInput("You rolled a" + result.toString() + ". Reroll?:", this.pid, ["Yes, reroll", "No, don't"]);
            if (choice === 0){
                result = super.roll(boon);
            }
        }

        print_well(super.toString() + " rolled a " + result.toString() + ".");

        return result;
    }

    async swapPositions(other){
        let current = this.plocation;

        this.plocation = other.plocation;

        other.plocation = current;

        this.plocation.occupied = this;

        other.plocation.occupied = other;

        print_well(this.getName() + " and " + other.getName() + " switched places!");
    }

    async turn(playSpace){
        let win = false;
        if(findInteriorArray(this.activeEffects, [10, 1])){
            print_well(this.getName() + "'s turn was skipped by the effects of Medusa's Head.");
            this.activeEffects = remove(this.activeEffects, [10, 1]);
        }else{
            print_well("It is " + this.getName() + "'s turn.");
            playSpace.displayState();
            let cont = true;
            let tickDownEffects = true;

            // Item phase
            if(this.hand.length <= 0){
                print_well(this.getName() + " has no items.");
            }else{
                // ALL THE FUCKING ITEMS
                let basePrompt = "Choose an item to use:";

                let prompt = basePrompt;

itemLoop: // Yeah, I labelled this while loop so I could break it inside the switch statement.
                while(true){
                    let options = ["Don't use an item."];

                    for(let item of this.hand){
                        options.push(item.toString());
                    }

                    let choice = await askForInput(prompt, this.pid, options);

                    prompt = basePrompt;

                    if(choice === 0){
                        break;
                    }else{
                        let item = this.hand[choice - 1];

                        let choice2;
                        let options2;

                        switch(item.cid){
                            // Dynamite - Destroy an adjacent path
                            case 0:
                                // Select a path
                                options2 = ["Never mind."];

                                for(let path of this.plocation.connectedPaths){
                                    options2.push(path.toString());
                                }

                                choice2 = await askForInput("Choose a path to destroy:", this.pid, options2);

                                // Destroy path or cancel use of item
                                if(choice2 === 0){
                                    continue itemLoop;
                                } else{
                                    print_well(this.getName() + " used " + item.toString());
                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                    let toRemove = this.plocation.connectedPaths[choice2 - 1];

                                    let temp = this.plocation.acrossPath(choice2 - 1).connectedPaths;

                                    temp.splice(temp.indexOf(toRemove), 1);

                                    print_well(this.getName() + " blew up the path " + toRemove.toString());

                                    this.plocation.connectedPaths.splice(choice2 - 1, 1);

                                    break itemLoop;
                                }

                                break;

                            // All the roll-altering items
                            case 1:
                            case 6:
                            case 7:
                            case 12:
                                let prompt2 = "Confirm using ";
                                switch (item.cid) {
                                    case 1:
                                        prompt2 += "Hookshot?";
                                        break;
                                    case 6:
                                        prompt2 += "Hera's Boon?";
                                        break;
                                    case 7:
                                        prompt2 += "Cornucopia of Tyche?";
                                        break;
                                    case 12:
                                        prompt2 += "Lesser Hookshot?";
                                        break;
                                }

                                choice2 = await askForInput(prompt2, this.pid, ["Confirm", "Cancel"]);

                                if(choice2 === 1){
                                    continue itemLoop;
                                } else{
                                    cont = false;
                                    print_well(this.getName() + " used " + item.toString());
                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);
                                    let score;

                                    switch (item.cid) {
                                        case 1:
                                            score = 6;
                                            break;
                                        case 6:
                                            score = await this.roll(true);
                                            break;
                                        case 7:
                                            score = await this.roll(false, true);
                                            break;
                                        case 12:
                                            score = 5;
                                            break;
                                    }

                                    await playSpace.choosePath(score, this);

                                    break itemLoop;
                                }

                                break;

                            //Helm of Invisibility - Move through players
                            case 2:
                                choice2 = await askForInput("Confirm using Helm of Invisibility?", this.pid, ["Confirm", "Cancel"]);

                                if(choice2 === 1){
                                    continue itemLoop;
                                } else{
                                    print_well(this.getName() + " used " + item.toString());
                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                    cont = false;

                                    let score = this.roll();

                                    await playSpace.choosePath(score, this, true);

                                    break itemLoop;
                                }
                                break;

                            // All the item-stealing items
                            case 3:
                            case 5:
                                options2 = ["Never mind."];

                                for(let player of playSpace.players){
                                    if(player.hand.length > 0){
                                        options2.push(player);
                                    }
                                }

                                choice2 = await askForInput("Choose a player to steal from: ", this.pid, convertToString(options2));

                                if(choice2 === 0){
                                    continue itemLoop;
                                } else{
                                    let player = playSpace.players[choice2 - 1];
                                    let check = await player.checkAndAsk([22]);

                                    if(check === null || check.cid !== 22){
                                        print_well(this.getName() + " used " + item.toString() + " on " + player.getName());
                                        await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);


                                        let options3 = [];

                                        for(let item2 of player.hand){
                                            if(item.cid === 3){
                                                options3.push(item2.toString());
                                            } else{
                                                options3.push("Some item");
                                            }
                                        }

                                        let choice3 = await askForInput("Choose an item to steal:", this.pid, convertToString(options3));

                                        await this.give(player.hand[choice3], playSpace, true);

                                        player.hand.splice(choice3, 1);

                                        shuffle(player.hand);

                                        break itemLoop;
                                    }else if(check !== null && check.cid === 22){
                                        print_well(player.getName() + " used Sleight of Hand to steal " + item.toString());

                                        remove(player.hand, 22);
                                        player.give(this.discard(choice - 1), playSpace, true);

                                        break itemLoop;
                                    }
                                }

                                break;

                            // A fortuitous deal - draw 2 cards
                            case 13:
                                choice2 = await askForInput("Confirm using A Fortuitous Deal?", this.pid, ["Confirm", "Cancel"]);

                                if(choice2 === 1){
                                    continue itemLoop;
                                }else{
                                    print_well(this.getName() + " used " + item.toString());
                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                    this.draw(playSpace, 2);

                                    break itemLoop;
                                }

                                break;

                            // Nike's Shoes
                            case 9:
                                choice2 = await askForInput("Confirm using Nike's Shoes?", this.pid, ["Confirm", "Cancel"]);

                                if(choice2 === 1){
                                    continue itemLoop;
                                }else{
                                    print_well(this.getName() + " used " + item.toString());
                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                    this.activeEffects.push([9, 1]);

                                    break itemLoop;
                                }

                                break;

                            // Medusa's Head
                            case 10:
                                options2 = ["Never mind"];

                                for(let player in playSpace.players){
                                    options2.push(player.toString());
                                }

                                choice2 = await askForInput("Choose a player to skip:", this.pid, options2);

                                if(choice === 0){
                                    continue itemLoop;
                                }else if(playSpace.players[choice2 - 1] === this){
                                    print_well(this.getName() + " used " + item.toString());
                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);
                                    print_well(this.getName() + "'s turn was skipped by the effects of Medusa's Head.");
                                    tickDownEffects = false;
                                    cont = false;
                                    break itemLoop;
                                }else{
                                    let player = playSpace.players[choice2 - 1];
                                    let check = await player.checkAndAsk([22]);

                                    if(check === null || check.cid !== 22){
                                        print_well(this.getName() + " used " + item.toString() + " on " + player.getName());
                                        await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                        player.activeEffects.push([10, 1]);
                                        break itemLoop;
                                    }else if(check !== null && check.cid === 22){
                                        print_well(player.getName() + " used Sleight of Hand to steal " + item.toString());

                                        remove(player.hand, 22);
                                        player.give(this.discard(choice - 1), playSpace, true);

                                        break itemLoop;
                                    }
                                }

                                break;

                            // Zeus' Bolt - Highest up player drops a spot
                            case 11:
                                choice2 = await askForInput("Confirm using Zeus' Bolt?", this.pid, ["Confirm", "Cancel"]);

                                if(choice2 === 1){
                                    continue itemLoop;
                                }else{
                                    print_well(this.getName() + " used " + item.toString());
                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                    for(let player of playSpace.findInDirection(2)[0]){
                                        playSpace.directlyMove(player);
                                    }

                                    break itemLoop;
                                }

                                break;

                            // Gun
                            case 14:
                                options2 = ["Never mind"];

                                for(let player of playSpace.players){
                                    options2.push(player.toString());
                                }

                                choice2 = await askForInput("Choose a player to shoot: ", this.pid, options2);

                                if(choice2 === 0){
                                    continue itemLoop;
                                }else{
                                    let player = playSpace.players[choice2 - 1];
                                    let check = await player.checkAndAsk([22]);

                                    if(check === null || check.cid !== 22){
                                        print_well(this.getName() + " used " + item.toString() + " on " + player.getName());
                                        await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                        player.activeEffects.push([14, 3]);
                                        break itemLoop;
                                    }else if(check !== null && check.cid === 22){
                                        print_well(player.getName() + " used Sleight of Hand to steal " + item.toString());

                                        remove(player.hand, 22);
                                        player.give(this.discard(choice - 1), playSpace, true);

                                        break itemLoop;
                                    }
                                }

                                break;

                            // Pogo Stick - Conditionally bounce up a spot
                            case 16:
                                if(playSpace.levels[1] <= this.plocation.y < playSpace.levels[3]){
                                    choice2 = await askForInput("Confirm using Pogo Stick?", this.pid, ["Confirm", "Cancel"]);

                                    if(choice2 === 1){
                                        continue itemLoop;
                                    }else{
                                        print_well(this.getName() + " used " + item.toString());
                                        await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                        let check = await this.roll();

                                        if(check >= 5){
                                            playSpace.directlyMove(this, 2);
                                        }else{
                                            print_well(this.getName() + " rolled too low to bounce!");
                                        }

                                        break itemLoop;
                                    }
                                }else{
                                    prompt = "You are not in levels 2-3. Try Again.<br>" + prompt;
                                    continue itemLoop;
                                }

                                break;

                            // Inside Man
                            case 17:
                                choice2 = await askForInput("Confirm using Inside Man?", this.pid, ["Confirm", "Cancel"]);

                                if(choice2 === 1){
                                    continue itemLoop;
                                }else{
                                    print_well(this.getName() + " used " + item.toString());
                                    playSpace.events.deck.push(this.discard(choice - 1));

                                    shuffle(playSpace.events.deck);
                                    playSpace.events.insideManPlayers.push(this);

                                    break itemLoop;
                                }

                                break;

                            // Orpheus' Music
                            case 15:
                                if(playSpace.items.discard.length <= 0){
                                    prompt = "No items to take!<br>" + prompt;
                                    continue itemLoop;
                                }else{
                                    choice2 = await askForInput("Confirm using Orpheus' Music?", this.pid, ["Confirm", "Cancel"]);

                                    if(choice2 === 1){
                                        continue itemLoop;
                                    }else{
                                        let options3 = [];

                                        for(let item2 of playSpace.items.discard){
                                            options3.push(item2.toString());
                                        }

                                        let choice3 = await askForInput("Choose a card to take: ", this.pid, options3);

                                        print_well(this.getName() + " used " + item.toString() + " to steal " + playSpace.items.discard[choice3].toString());
                                        this.give(playSpace.items.discard[choice3], playSpace, true);
                                        await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                        playSpace.items.discard.splice(choice3, 1);

                                        break itemLoop;
                                    }
                                }

                                break;

                            // Controlled Burn - I hate this one, and no one fucking uses it
                            case 18:
                                let tokenSpaces = playSpace.tokenSpaces();

                                if(tokenSpaces.length >= 3) {
                                    options2 = ["Never mind."];

                                    for (let tokenSpace of tokenSpaces) {
                                        options2.push(tokenSpace.toString());
                                    }

                                    let choices = [];
                                    let cont2 = true;
                                    let basePrompt2 = "Choose a token to discard: ";

                                    for (let loop = 0; loop < 3; loop++) {
                                        let cont3 = true;

                                        let prompt2 = basePrompt2;
                                        while (true) {
                                            choice2 = await askForInput(prompt2, this.pid, options2);

                                            if (choice2 === 0) {
                                                cont2 = false;
                                                cont3 = false;
                                                break;
                                            } else if (choices.includes(choice2)) {
                                                prompt2 = "Already selected that one. Try again.<br>" + prompt2;
                                            } else {
                                                choices.push(choice2);
                                                options2[choice2] = "Already selected";
                                                break;
                                            }
                                        }

                                        if (cont3) {
                                            // pass
                                        } else {
                                            break;
                                        }
                                    }

                                    if (cont2) {
                                        print_well(this.getName() + " used Controlled Burn, removing tokens from spaces " + tokenSpaces[choices[0] - 1].toString() + ", " + tokenSpaces[choices[1] - 1].toString() + ", and " + tokenSpaces[choices[2] - 1] + "!");
                                        await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                        for (let selection of choices) {
                                            playSpace.tokens.push(tokenSpaces[selection - 1].token);
                                            tokenSpaces[selection - 1].token = -1;
                                        }

                                        break itemLoop;
                                    } else {
                                        continue itemLoop;
                                    }
                                }else{
                                    prompt = "There are less than 3 tokens on the board and I don't care about this enough to add functionality in this scenario.<br>" + prompt;
                                    continue itemLoop;
                                }

                                break;

                            // Greek Fire
                            case 19:
                                options2 = ["Never mind."];

                                for(let path of this.plocation.connectedPaths){
                                    options2.push(path.toString());
                                }

                                choice2 = await askForInput("Choose an adjacent path: ", this.pid, options2);

                                if(choice2 === 0){
                                    continue itemLoop;
                                }else{
                                    let adjacent = this.plocation.acrossPath(choice2 - 1);

                                    let options3 = [];

                                    for(let path of adjacent.connectedPaths){
                                        options3.push(path.toString());
                                    }

                                    let choice3 = await askForInput("Select a path to destroy: ", this.pid, options3);

                                    let toRemove = adjacent.connectedPaths[choice3];

                                    let temp = adjacent.acrossPath(choice3).connectedPaths;

                                    temp.splice(temp.indexOf(toRemove), 1);

                                    print_well(this.getName() + " blew up the path " + toRemove.toString());

                                    await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                    adjacent.connectedPaths.splice(choice3, 1);

                                    break itemLoop;
                                }

                                break;

                            // Snitch on a Bitch - SWEET RELEASE!
                            case 20:
                                let highest = playSpace.findInDirection(2)[0];

                                if(highest.length === 1){
                                    choice2 = await askForInput("Confirm using Snitch on a Bitch?", this.pid, ["Confirm", "Cancel"]);

                                    if(choice2 === 1){
                                        continue itemLoop;
                                    }else{
                                        print_well(this.getName() + " used " + item.toString());
                                        await playSpace.items.addToDiscard(this.discard(choice - 1), playSpace);

                                        playSpace.move(highest[0], 18, 7);

                                        break itemLoop;
                                    }
                                }else{
                                    prompt = "Must be one and only one highest player.<br>" + prompt;
                                    continue itemLoop;
                                }

                                break;
                            case 4:
                            case 8:
                            case 21:
                            case 22:
                               prompt = "That item cannot be used in this scenario.<br>" + prompt;
                               break;
                            default:
                                prompt = "Not yet implemented.<br>" + prompt;
                                break;
                        }
                    }
                }
            }

            // Unless an item overrides the turn, turn continues as normal after
            if(cont){
                let score = await this.roll();

                await playSpace.choosePath(score, this);
            }

            // Ticks down effect counters
            if(tickDownEffects) {
                for (let index = 0; index < this.activeEffects.length; index++) {
                    // Gun
                    if (this.activeEffects[index][0] === 14) {
                        this.activeEffects[index][1] -= 1;
                        if (this.activeEffects[index][1] <= 0) {
                            print_well(this.getName() + " is no longer affected by Gun!");
                            this.activeEffects.splice(index, 1);
                            index -= 1;
                        }
                    }
                }
            }

            if(this.plocation.x === 7 && this.plocation.y === 20){
                print_well(this.getName() + " won!");
                return true;
            }

            let nextIndex = playSpace.players.indexOf(this) + 1;

            // Items are just the id. Events are id + .1. For differentiation
            if(findInteriorArray(this.activeEffects, [8.1, 1])){
                nextIndex -= 1;
                this.activeEffects = remove(this.activeEffects, [8.1, 1]);
            } else if(findInteriorArray(this.activeEffects, [9, 1])){
                nextIndex -= 1;
                this.activeEffects = remove(this.activeEffects, [9, 1]);
            }

            if(nextIndex >= playSpace.players.length){
                nextIndex = 0;
            }

            return{
                win: win,
                nextIndex: nextIndex
            };
        }
    }
}

class TextBoard extends Board{
    constructor(itemData, eventData){
        super();
        let itemList = [];
        let eventList = [];

        for (let item of itemData){
            itemList.push(new TextCard(item));
        }

        for (let event of eventData){
            eventList.push(new TextCard(event));
        }

        this.items = new TextDeck(itemList);
        this.events = new TextDeck(eventList, true);
    }

    async afterMovementCleanup(player){
        for(let token of player.cuedTokens){
            switch(token){
                case 0:
                    print_well(player.getName() + " got a nothing token.");
                    break;
                case 1:
                    print_well(player.getName() + " got an event token.");
                    await this.events.runEvent(player, this);
                    break;
                default:
                    print_well(player.getName() + " got an item token.");
                    await player.draw(this);
                    break;
            }
        }

        player.cuedTokens = []; // This feels dirty

        while(true){
            if(player.plocation.y >= this.levels[player.currentLevel]){
                player.currentLevel += 1;
                print_well(player.getName() + " has entered level " + player.currentLevel.toString() + " for the first time.");

                await this.events.runEvent(player, this);

                for(let tempPlayer of this.players){
                    tempPlayer.draw(this);
                }
            } else{
                break;
            }
        }
    }

    async move(player, y, x, fromPath=false) {
        let old = player.plocation.copy();

        if(super.move(player, y, x)){
            print_well(player.getName() + " moved from " + old.toString() + " to " + player.plocation.toString() + ".");

            if(fromPath){
                // pass
            } else{
                await this.afterMovementCleanup(player);
            }

            return true;
        } else{
            return false;
        }
    }

    displayState(){
        for(let player of this.players){
            print_well(player.toString());
        }
    }

    async directlyMove(player, direction = 0, pickaxeSaves=true) {
        let check = null;

        if(pickaxeSaves){
            check = await player.checkAndAsk([4]);
        }

        if(check === null || check.cid !== 4){
            let state = super.directlyMove(player, direction);

            if(state === -1){
                print_well(player.getName() + " couldn't move in that direction!");
            }else if(state === 0){
                // pass
            }else if(state instanceof TextPlayer){
                print_well(player.getName() + " couldn't move in that direction due to the presence of " + state.getName());
            }else{
                print_well("Code fucked up.");
            }
        }else if(check !== null && check.cid === 4){
            print_well(player.getName() + " used a pickaxe to avoid moving!");
        }
    }

    async moveToPossible(player, direction = 0) {
        let check = player.checkAndAsk([4]);

        if(check === null || check.cid !== 4) {
            super.moveToPossible(player, direction);
        } else if(check !== null && check.cid === 4){
            print_well(player.getName() + " used a pickaxe to avoid moving!");
        }
    }

    addPlayer(pid, y, x, pname="Player " + pid){
        this.players.push(new TextPlayer(pid, this.get(y, x), pname));
    }

    async choosePath(rollValue, player, helm=false){
        let start = player.plocation.copy();
        let current = player.plocation;

        let pathChosen = [start];
        let scoresTaken = [];

        let canMove = false;

        for(let path of current.connectedPaths){
            if(path.score <= rollValue){
                canMove = true;
                while(true){
                    while(rollValue > 0){
                        let offset = 1;
                        let options = ["Stop here."];

                        if(pathChosen.length === 1){
                            // pass
                        } else{
                            options.push("Go Back");
                            offset = 2;
                        }

                        for(let index = 0; index < current.connectedPaths.length; index++){
                            if(current.acrossPath(index).occupied === null || current.acrossPath(index).equals(start)){
                                options.push(current.toString() + " --" + current.connectedPaths[index].score.toString() + "--> " + current.acrossPath(index).toString() + ".");
                            } else if(helm){
                                options.push("Land on " + current.acrossPath(index).occupied.getName() + " at " + current.acrossPath(index).toString() + " for a score of " + current.connectedPaths[index].score.toString() + ".");
                            } else{
                                options.push(current.acrossPath(index).occupied.getName() + " is at " + current.acrossPath(index).toString() + ".");
                            }
                        }

                        let cont = false;

                        let basePrompt = "You are currently at " + current.toString() + " with a remaining score of " + rollValue.toString() + ".<br>Choose a path to go down: ";
                        let prompt = basePrompt;

                        while(true){
                            let choice = await askForInput(prompt, player.pid, options);

                            prompt = basePrompt;

                            if(choice === 0){
                                pathChosen.push(current);
                                break;
                            } else if(choice === 1 && offset === 2){
                                pathChosen.pop();
                                pathChosen.reverse();
                                current = pathChosen[0];
                                pathChosen.reverse();
                                rollValue += scoresTaken.pop();
                                cont = true;
                                break;
                            } else{
                                if(options[choice].includes("is at") && !options[choice].includes("Land on")){
                                    prompt = "That space is occupied. Try again.<br>" + prompt;
                                }else if(current.connectedPaths[choice - offset].score > rollValue){
                                    prompt = "The path score is too high. Try again.<br>" + prompt;
                                } else{
                                    rollValue -= current.connectedPaths[choice - offset].score;
                                    let nextSpace = current.acrossPath(choice - offset);
                                    scoresTaken.push(current.connectedPaths[choice - offset].score);

                                    if(options[choice].includes("Land on")){
                                        if(nextSpace.connectedPaths){
                                            let options2 = [];
                                            for(let index=0; index < nextSpace.connectedPaths.length; index++){
                                                options2.push(nextSpace.acrossPath(index));
                                            }

                                            let choice2 = await askForInput("Choose a space to go to for no score cost:", player.pid, options2);

                                            current = nextSpace.acrossPath(choice2);
                                        }else{
                                            prompt = "No connected space! Try again." + prompt;
                                            continue;
                                        }
                                    }else{
                                        current = nextSpace;
                                    }

                                    pathChosen.push(current);

                                    // Ugly workaround - apparently - converting from python code from a month ago
                                    if(rollValue === 0){
                                        pathChosen.push(current);
                                    }

                                    cont = true;
                                    break;
                                }
                            }
                        }
                        if(cont){
                            // pass
                        }else{
                            break;
                        }
                    }

                    let confirmPrompt = "Desired path is<br>";

                    for(let index = 1; index < pathChosen.length - 1; index++){
                        confirmPrompt += pathChosen[index - 1].toString() + "--->" + pathChosen[index].toString() + "<br>";
                    }

                    let choiceConfirm = await askForInput(confirmPrompt + "Confirm path?", player.pid, ["Confirm", "Reset path"]);

                    if(choiceConfirm === 1){
                        current = start;
                        pathChosen = [start];
                        for(let score of scoresTaken){
                            rollValue += score;
                        }
                        scoresTaken = []; // still feels dirty
                        continue;
                    }else{
                        break;
                    }
                }

                for(let index=1; index < pathChosen.length - 1; index++){
                    await this.move(player, pathChosen[index].y, pathChosen[index].x, true);
                }

                await this.afterMovementCleanup(player);

                break;
            }
        }

        if(canMove){
            // pass
        }else{
            print_well(player.getName() + " cannot move.");
        }

        if(pathChosen.length <= 2 && player.plocation.y >= this.levels[3]){
            await this.moveToPossible(player);
        }
    }
}