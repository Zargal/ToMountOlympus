import sqlite3
import random
import string
import html
import os
import hashlib
from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from whitenoise import WhiteNoise


def get_data(d_id, g_id, auth):
    data = []

    if auth == passw + "8by2gqo4vbv9v5wnrmifu6" and d_id in [0, 1, 2]:
        dbLocal = sqlite3.connect("./cards.db")
        curLocal = dbLocal.cursor()
        if d_id == 2:
            curLocal.execute("SELECT * FROM Messages WHERE game=?", [g_id])
        elif d_id == 1:
            curLocal.execute("SELECT * FROM items")
        else:
            curLocal.execute("SELECT * FROM events")
        results = curLocal.fetchall()
        dbLocal.close()

        for index in range(len(results)):
            if d_id in [0, 1]:
                for i in range(results[index][1]):
                    data.append(results[index])
            else:
                data.append(results[index])

        return data

    else:
        return None


def convertMessage(message):
    message = html.escape(message)

    message = message.split("|")

    messageFinal = []

    bitsAltered = []

    if len(message) > 1:
        for index, bit in enumerate(message):
            if index < len(message) - 1:
                if len(bit) > 0 and bit[0] == 'n':
                    if bit[1:].isnumeric():
                        if index != 0:
                            dbLocal = sqlite3.connect("./cards.db")
                            curLocal = dbLocal.cursor()
                            curLocal.execute('''SELECT * FROM players WHERE p_id=?''', [int(bit[1:])])
                            results = curLocal.fetchall()
                            dbLocal.close()

                            if results:

                                if index > 1 and index - 2 in bitsAltered:
                                    messageFinal[-1] += '<span class="name">' + results[0][1].upper() + \
                                                        " (" + bit[1:] + ")" '</span>' + message[index + 1]
                                    bitsAltered.append(index)
                                    continue

                                messageFinal.append(message[index - 1] + '<span class="name">' + results[0][1].upper() +
                                                    " (" + bit[1:] + ")" '</span>' + message[index + 1])

                                if index > 2 and index - 3 in bitsAltered:
                                    del messageFinal[-2]

                                bitsAltered.append(index)

                                continue

            if index != 0 and index - 1 not in bitsAltered:
                messageFinal.append(bit)

        message = "|".join(messageFinal)
    else:
        message = message[0]

    return message


db = sqlite3.connect("./cards.db")
cur = db.cursor()
cur.execute("DELETE FROM Messages")
cur.execute("DELETE FROM sqlite_sequence WHERE name='Messages'")
cur.execute("DELETE FROM games")
cur.execute("DELETE FROM players")
db.commit()
db.close()
sys_random = random.SystemRandom()

rooms = {}

app = Flask(__name__)
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/')
app.config['SECRET_KEY'] = "".join(sys_random.choices(string.ascii_letters + string.digits, k=45))
app_socket = SocketIO(app)

# My paltry attempts at security - does nothing, really - really couldn't figure out anything better
# Mainly obfuscation
passw = "".join(sys_random.choices(string.ascii_letters + string.digits, k=45))

games = []
players = []


@app.route('/_535x2', methods=["POST"])
def get_pass():
    return jsonify(passw)


@app_socket.on('request_game_id')
def request_game_id(auth, data, sid):
    pass1 = data[0]
    pass2 = data[1]
    salt = "".join(sys_random.choices(string.ascii_letters + string.digits, k=45))
    s = hashlib.sha3_512()
    s.update((pass1 + salt).encode('utf-8'))
    hash1 = s.hexdigest()
    s = hashlib.sha3_512()
    s.update((pass2 + salt).encode('utf-8'))
    hash2 = s.hexdigest()

    if auth == passw + "8by2gqo4vbv9v5wnrmifu6":
        if len(games) >= 50:
            emit("No free game slots")
        else:
            while True:
                trying = sys_random.randint(0, 50)
                if trying not in games:
                    games.append(trying)
                    dbLocal = sqlite3.connect("./cards.db")
                    curLocal = dbLocal.cursor()
                    curLocal.execute("INSERT INTO games (g_id, hash, salt, hash2) VALUES (?, ?, ?, ?)",
                                     (trying, hash1, salt, hash2))
                    dbLocal.commit()
                    dbLocal.close()
                    rooms[trying] = sid
                    join_room(trying)
                    emit("Game_Creation_Success", trying)  # There is no consistency in my event tags
                    break
    else:
        emit("Unauthorized")


@app_socket.on("join_game")
def join_game(name, g_id, pass1, auth, sid):
    if auth == passw + "8by2gqo4vbv9v5wnrmifu6":
        name = html.escape(name)
        dbLocal = sqlite3.connect("./cards.db")
        curLocal = dbLocal.cursor()
        curLocal.execute('''SELECT * FROM games WHERE g_id=?''', [g_id])
        results = curLocal.fetchall()
        s = hashlib.sha3_512()
        s.update((pass1 + results[0][2]).encode('utf-8'))

        hash1 = s.hexdigest()

        if hash1 == results[0][1]:
            if len(players) >= 1000:
                emit("No free player slots")
            else:
                trying = sys_random.randint(0, 1000)

                while trying in players:
                    trying = sys_random.randint(0, 1000)

                players.append(trying)

                curLocal.execute('''INSERT INTO players (p_id, name, game, socketID) VALUES (?, ?, ?, ?)''',
                                 (trying, name, results[0][0], sid))
                dbLocal.commit()
                dbLocal.close()
                join_room(results[0][0])
                emit("joined successfully", {"p_id": trying, "g_id": results[0][0]})
                add_message("|n" + str(trying) + "| has joined.", results[0][0], passw + "8by2gqo4vbv9v5wnrmifu6")
                emit("player joined", {"pid": trying}, room=rooms[results[0][0]])
        else:
            dbLocal.close()
            emit("Wrong password trying to enter game")
    else:
        emit("Unauthorized")


@app_socket.on("leave_game")
def leave_game(g_id, p_id):
    leave_room(g_id)
    add_message("|n" + str(p_id) + "| has left.", g_id, passw + "8by2gqo4vbv9v5wnrmifu6")


@app_socket.on('get_messages')
def get_messages(g_id, auth):
    result = get_data(2, g_id, auth)

    if result is None:
        emit("Unauthorized")
    else:
        emit("SQL data response", result)


@app.route('/_get_data', methods=['POST'])
def get_cards():
    d_id = int(request.form.get('d_id'))
    auth = request.form.get('info')

    if d_id in [0, 1]:
        return jsonify(get_data(d_id, 0, auth))
    else:
        return jsonify(False)


@app_socket.on("add_message")
def add_message(message, g_id, auth):
    message = convertMessage(message)

    if auth == passw + "8by2gqo4vbv9v5wnrmifu6":
        if message != '' and g_id is not None:
            dbLocal = sqlite3.connect("./cards.db")
            curLocal = dbLocal.cursor()
            curLocal.execute("INSERT INTO Messages (Message, Game) VALUES (?, ?)", (message, g_id))
            dbLocal.commit()
            dbLocal.close()

            emit("Message sent", room=g_id)
    else:
        emit("Unauthorized")


@app_socket.on("Looking for Input")
def look_for_input(prompt, p_id, options, r_id):
    dbLocal = sqlite3.connect("./cards.db")
    curLocal = dbLocal.cursor()
    curLocal.execute('''SELECT socketID FROM players WHERE p_id=?''', [p_id])
    results = curLocal.fetchall()
    dbLocal.close()

    for index in range(len(options)):
        options[index] = convertMessage(options[index])

    emit("getting input",
         {"prompt": prompt, "options": options, "rid": r_id}, room=results[0][0])


@app_socket.on("Input response")
def send_back_input(choice, g_id, r_id):
    emit("input response to host", [int(choice), r_id], room=rooms[g_id])


@app_socket.on("refresh_card_data")
def send_card_data(p_id, data):
    dbLocal = sqlite3.connect("./cards.db")
    curLocal = dbLocal.cursor()
    curLocal.execute('''SELECT socketID FROM players WHERE p_id=?''', [p_id])
    results = curLocal.fetchall()
    dbLocal.close()

    emit("got_card_data", data, room=results[0][0])


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico',
                               mimetype='image/vnd.microsoft.icon')


@app.route("/")
def screen():
    return render_template("main.html")


if __name__ == '__main__':
    app_socket.run(app, host='0.0.0.0')
