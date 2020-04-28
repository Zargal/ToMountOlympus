// The FUNction that queries the python code that returns SQLite data
function getSQLdata(d_id, info){
    return new Promise(function (resolve) { // I hate promises
        setTimeout(function () {
            $.post('/_get_data', {
                d_id: d_id,
                info: info
            }, function (data) {
                resolve(data);
            });
        }, 0); // Is timeout 0 bad practice?
    });
}

function getInfo(){
    return new Promise(function (resolve) {
        setTimeout(function () {
            $.post('/_535x2', {}, function (data) {
                resolve(data);
            });
        }, 0);
    });
}

// Convenient Shuffle
function shuffle(array) {
    array.sort(() => Math.random() - 0.5);
}

// Convenient Random
function getRndInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

// Returns proper array for directional movement
function properDirection(player, direction=0){
    let toCheck;

    // 0 - down, 1 - right, 2 - up, 3 - left
    switch(direction){
        case 0:
            toCheck = Array.from(Array(player.plocation.y).keys()).reverse();
            break;
        case 2:
            toCheck = Array.from(Array(this.height).keys());
            toCheck.splice(0, player.plocation.y + 1);
            break;
        case 3:
            toCheck = Array.from(Array(this.width).keys());
            toCheck.splice(0, player.plocation.x + 1);
            break;
        default:
            toCheck = Array.from(Array(player.plocation.x).keys()).reverse();
            break;
    }

    return toCheck;
}

// Expediting grid creation. Determines proper min and max x-values for a row
function properValueOdd(index) {
    if (2 < index && index < 8){
        return {
            xmin: 2,
            xmax: 12
        };
    } else if (8 < index && index < 14){
        return {
            xmin: 4,
            xmax: 10
        };
    } else{
        return {
            xmin : 6,
            xmax : 8
        };
    }
}

function properValueEven(index) {
    if (5 < index && index <11){
        return {
            xmin: 3,
            xmax: 11
        };
    } else{
        return {
            xmin: 5,
            xmax: 9
        };
    }
}

// When making paths, there are certain spots that are very convenient for making all necessary paths.
// This function determines the proper scores for those paths
function properScores(index){
    if (3 < index && index < 11){
        return {
            up: 3,
            token: 2,
            down: 2
        };
    } else if (index === 13){ //THREE FUCKING EQUALS SIGNS
        return {
            up: 4,
            token: 3,
            down: 3
        };
    } else{
        return {
            up: 5,
            token: 4,
            down: 3
        };
    }
}

//Defines the Card class that stores information about a card.
class Card {
    constructor(data) {
        this.cid = data[0];

        this.cname = data[3];

        this.description = data[2];
    }

    toString(){
        return this.cname + ": " + this.description;
    }

    equals(other){
        return this.cid === other.cid;
    }
}

class Player {
    constructor(pid, plocation, pname="Player "+pid){
        this.pid = pid;
        this.pname = pname;
        this.plocation = plocation;
        this.plocation.occupied = this;
        this.hand = [];
        this.handLimit = 3;
        this.currentLevel = 1;
        this.cuedTokens = [];
        this.activeEffects = [];
        this.firstLocation = this.plocation;
    }

    toString(){
        return "|n" + this.pid.toString() + "|";
    }

    give(item){
        this.hand.push(item);
    }

    roll(boon=false){
        let rollBonus = 0;
        let result;

        for(let effect of this.activeEffects){
            if(effect[0] === 14){
                rollBonus -= 3
            }
        }

        if(boon){
            result = getRndInt(1, 7) + getRndInt(1, 7);
        } else{
            result = getRndInt(1, 7);
        }

        result += rollBonus;

        if(result<0){
            result = 0;
        }

        return result;
    }

    check(items){
        let result = [];

        for (let item of this.hand){
            if(items.includes(item.cid)){
                result.push(item);
            }
        }

        return result;
    }

    discard(index){
        let result = this.hand[index];
        this.hand.splice(index, 1);
        return result;
    }

    draw(playSpace){
        this.give(playSpace.items.draw());
    }
}

class Deck{
    constructor(cards, events=false){
        this.deck = cards;
        shuffle(this.deck);
        this.discard = [];
        this.insideManPlayers = [];
        this.events = events;
    }

    draw(){
        return this.deck.pop();
    }

    reset(){
        // I realized my Python code did this, couldn't immediately think of something better and said "Fuck it"
        for (let card in this.discard){
            this.deck.push(this.discard.pop());
        }

        shuffle(this.deck);
    }

    addToDiscard(card, playSpace){
        this.discard.push(card);

        if(this.deck.length === 0){
            this.reset();
        }
    }
}

class Space{
    constructor(y, x, token=-1){
        this.token = token;
        this.y = y;
        this.x = x;
        this.occupied = null;
        this.connectedPaths = [];
    }

    toString(){
        let serf = "";

        if (this.x === 20 && this.y===7){
            serf = " GOAL";
        } else if ([0, 1, 2].includes(this.token)){
            serf = " TOKEN";
        }

        return "(" + this.y.toString() + ", " + this.x.toString() + ")" + serf;
    }

    createBothPaths(other, score){
        let result = new Path([this, other], score);

        this.connectedPaths.push(result);
        other.connectedPaths.push(result);
    }

    acrossPath(index){
        if (index < this.connectedPaths.length){
            const temp = this.connectedPaths[index];
            for (const connection of temp.connectedTo){
                if (connection.equals(this)){
                    //pass
                } else{
                   return connection;
                }
            }
        }
    }

    equals(other){
        return this.x === other.x && this.y === other.y;
    }

    copy(){
        let result = new Space(this.y, this.x);
        result.connectedPaths = Array.from(this.connectedPaths);
        result.token = this.token;
        return result;
    }
}

class Path{
    constructor(connections, score){
        this.connectedTo = connections;
        this.score = score;
    }
    
    equals(other){
        const comp1 = Array.from(this.connectedTo);
        const comp2 = Array.from(other.connectedTo);

        comp1.sort(function(a, b){
            if (a.x < b.x || a.y < b.y){
                return -1;
            } else if (a.x === b.x && a.y < b.y){
                return 0;
            } else{
                return 1;
            }
        });

        comp2.sort(function(a, b){ // I did not want to write the same code twice. My hands were tied.
            if (a.x < b.x || a.y < b.y){
                return -1;
            } else if (a.x === b.x && a.y < b.y){
                return 0;
            } else{
                return 1;
            }
        });

        return comp1 === comp2;
    }

    toString(){
        return this.connectedTo[0].toString() + " <--" + this.score.toString() + "--> " +
            this.connectedTo[1].toString()
    }
}

// Contains pretty much all of the remaining information
class Board{
    constructor(){
        this.players = [];

        this.grid = [];
        this.width = 15;
        this.height = 21;

        // 0 - nothing, 1 - event, 2 - item
        this.tokens = [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
        shuffle(this.tokens);
        this.levels = [0, 4, 10, 17, 30]; // Arbitrarily large final value

        // Generating the board - it is long. Could be simplified.
        for (let i = 0; i < this.height; i++){
            let nextRow = [];

            if (i === 0 || i === 1){ // Rows 0 and 1 have spaces every even number
                for (let j = 0; j < this.width; j++){
                    if ((j % 2) === 0){
                        nextRow.push(new Space(i, j));
                    } else{
                        nextRow.push(null);
                    }
                }
            } else if (i === 2 || i === 4){ // Rows 2 and 4 have spaces every odd number
                for (let j = 0; j < this.width; j++){
                    if ((j % 2) === 0){
                        nextRow.push(null);
                    } else{
                        nextRow.push(new Space(i, j));
                    }
                }
            } else if (i === 20){ // Row 20 only has a space at x=7 - goal
                for (let j = 0; j < this.width; j++){
                    if (j === 7){
                        nextRow.push(new Space(i, j));
                    } else{
                        nextRow.push(null);
                    }
                }
            } else if ((i % 2) === 0){ // Even valued rows have spaces every odd number within bounds defined in function
                let {xmin, xmax} = properValueEven(i);

                for (let j = 0; j < this.width; j++){
                    if (j < xmin || j > xmax){
                        nextRow.push(null);
                    } else if((j % 2) === 0){
                        nextRow.push(null);
                    } else{
                        nextRow.push(new Space(i, j));
                    }
                }
            } else{ // Odd numbered rows have spaces every even number within bounds defined in function
                let {xmin, xmax} = properValueOdd(i);

                for (let j = 0; j < this.width; j++){
                    if (j < xmin || j > xmax){
                        nextRow.push(null);
                    } else if((j % 2) === 0){
                        nextRow.push(new Space(i, j));
                    } else{
                        nextRow.push(null);
                    }
                }
            }

            this.grid.push(nextRow);
        }

        // That was just the spaces. Now the paths.
        for (let i = 0; i < this.height; i++){
            for (let j = 0; j < this.width; j++){
                if (this.grid[i][j] === null){ // Don't try to add paths to nonexistent spaces
                    // pass
                } else{

                    if (i === 0){ // 0th row

                        // Every 0th row space has a path straight up
                        this.grid[i][j].createBothPaths(this.grid[i + 1][j], 1);

                        if ((j % 4) === 0) { // Every other space
                            /*
                            Only the 0th row has horizontal paths, so only they need to worry about duplicates
                            Also, when I was complaining about Python and lists, I was mistaken.
                            A weird error occurred on my end, and I generalized in haste.
                             */

                            if (j > 0) { // Every space but the first has a path to the right
                                this.grid[i][j].createBothPaths(this.grid[i][j - 2], 1);
                            }

                            if (j < 14) { // Every space but the last has a path to the left
                                this.grid[i][j].createBothPaths(this.grid[i][j + 2], 1);
                            }
                        }


                    } else if (i === 1){ // 1st row
                        // Paths up to left or right
                        if (j > 1){
                            this.grid[i][j].createBothPaths(this.grid[i + 1][j - 1], 2);
                        }

                        if (j < 13){
                            this.grid[i][j].createBothPaths(this.grid[i + 1][j + 1], 2);
                        }


                    } else if (i === 19){ // 19th row - just before goal
                        // Only two spaces to worry about

                        if (j === 6){
                            this.grid[i][j].createBothPaths(this.grid[i + 1][j + 1], 4);
                        } else{
                            this.grid[i][j].createBothPaths(this.grid[i + 1][j - 1], 4);
                        }

                        // Both spaces have a path straight down
                        this.grid[i][j].createBothPaths(this.grid[i - 2][j], 3);


                    } else if (((i - 1) % 3) === 0){
                        /*
                        Fun algorithm nonsense!
                        Once you've dealt with all the paths we already have, EVERY other path can be handled
                        by calculating the paths for the spaces on those rows that go into tokens.
                        There are three categories of the paths off of those:
                            1) The paths up to the left or right
                            2) The paths down to the left or right going to token spaces
                            3) The path straight down
                         */

                        let {up, token, down} = properScores(i);

                        if (j > ((i - 1) / 3)){
                            this.grid[i][j].createBothPaths(this.grid[i + 1][j - 1], up);
                            this.grid[i][j].createBothPaths(this.grid[i - 1][j - 1], token);
                        }

                        if (j < ((43 - i) / 3)){
                            this.grid[i][j].createBothPaths(this.grid[i + 1][j + 1], up);
                            this.grid[i][j].createBothPaths(this.grid[i - 1][j + 1], token);
                        }

                        this.grid[i][j].createBothPaths(this.grid[i - 2][j], down);
                    }
                }
            }
        }

        // Adding tokens
        for (let i = 3; i < 16; i += 3){
            for (let j = 0; j < this.width; j++){
                if (this.grid[i][j] === null){
                    // pass
                } else{
                    this.grid[i][j].token = this.tokens.pop(); // Randomly distributing the tokens.
                }
            }
        }
    }

    // Returns whatever's in the grid at that location, null if nothing
    get(y, x){
        return this.grid[y][x];
    }

    // Moves a player to a specified spot if possible and adds cued tokens
    move(player, y, x){
        if (this.get(y, x) === null || this.get(y, x).occupied !== null){ // If space doesn't exist or is occupied, stop
            return false;
        } else{
            this.get(player.plocation.y, player.plocation.x).occupied = null;
            player.plocation = this.get(y, x);
            this.get(y, x).occupied = player;

            if ([0, 1, 2].includes(player.plocation.token)){
                player.cuedTokens.push(player.plocation.token);
                this.tokens.push(player.plocation.token);
                player.plocation.token = -1;
            }

            return true;
        }
    }

    // Moves a player directly over on the board. You know, that thing no one read in the rules?
    directlyMove(player, direction=0){
        let toCheck = properDirection(player, direction);
        let state = -1;

        if ([0, 2].includes(direction)){ // Moving in y direction
            for (let i of toCheck){
                if (this.get(i, player.plocation.x) === null){ // Make sure there's a spot - If not, go past it
                    continue; // Unnecessary, but it looks nicer.
                } else if (this.get(i, player.plocation.x).occupied === null){ // Make sure it's unoccupied
                    this.move(player, i, player.plocation.x);
                    state = 0;
                    break;
                } else{ // Will stop if the closest spot is occupied.
                    state = this.get(i, player.plocation.x).occupied;
                    break;
                }
            }
        } else{
            for (let j of toCheck){
                if (this.get(player.plocation.y, j) === null){
                    continue; // As here
                } else if (this.get(player.plocation.y, j).occupied === null){
                    this.move(player, player.plocation.y, j);
                    state = 0;
                    break;
                } else{
                    state = this.get(player.plocation.y, j).occupied;
                    break;
                }
            }
        }

        return state;
    }

    // Moves the player in a direction until there's a valid spot.
    moveToPossible(player, direction=0){
        let toCheck = properDirection(player, direction);

        if ([0, 2].includes(direction)){
            for (let i of toCheck){
                if ((this.get(i, player.plocation.x) === null) || (this.get(i, player.plocation.x).occupied !== null)){
                    continue;
                } else{
                    this.move(player, i, player.plocation.x);
                    break;
                }
            }
        } else{
            for (let j of toCheck){
                if ((this.get(player.plocation.y, j) === null) || (this.get(player.plocation.y, j).occupied !== null)){
                    continue;
                } else{
                     // Will only stop looking if it finds an unoccupied spot or literally every spot is invalid
                    this.move(player, player.plocation.y, j);
                    break;
                }
            }
        }
    }

    // Return an array of arrays of the players in order. If two players are on the same value, they share an array
    findInDirection(direction=0){
        let toCheck;

        // 0 - Bottom to top, 1 - right to left, 2 - top to bottom, 3 - left to right
        switch(direction){
            case 0:
                toCheck = Array.from(Array(this.height).keys());
                break;
            case 1:
                toCheck = Array.from(Array(this.width).keys()).reverse();
                break;
            case 2:
                toCheck = Array.from(Array(this.height).keys()).reverse();
                break;
            default:
                toCheck = Array.from(Array(this.width).keys());
                break;
        }

        let players = [];

        if ([0, 2].includes(direction)){
            for (let i of toCheck){
                let result = [];

                for (let j = 0; j < this.width; j++){
                    if (this.get(i, j) === null || this.get(i, j).occupied === null){
                        // pass
                    } else{
                        result.push(this.get(i, j).occupied);
                    }
                }

                if (result.length === 0){
                    // pass
                } else{
                    players.push(result);
                }
            }
        } else{
            for (let j of toCheck){
                let result = [];

                for (let i = this.height - 1; i >= 0; i--){
                    if (this.get(i, j) === null || this.get(i, j).occupied === null){
                        // pass
                    } else{
                        result.push(this.get(i, j).occupied);
                    }
                }

                if (result.length === 0){
                    // pass
                } else{
                    players.push(result);
                }
            }
        }

        return players;
    }

    tokenSpaces(){
        let result = [];

        for (let i = 0; i < this.height; i++){
            for (let j = 0; j < this.width; j++){
                if (this.get(i, j) === null || ![0, 1, 2].includes(this.get(i, j).token)){
                    // pass
                } else{
                    result.push(this.get(i, j));
                }
            }
        }

        return result;
    }
}

