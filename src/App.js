import './App.css';
import { BrowserRouter, Route, Routes } from "react-router-dom";
import NewCode from "./pages/NewCode";
import GetCode from "./pages/GetCode";
import Home from "./pages/Home";
import { CodeContext } from './contexts/CodeContext';
import { SocketContext } from './contexts/SocketContext.js';
import { useState } from 'react';
import { io } from 'socket.io-client';

function App() {
  const langs = {
      54: 'cpp'
  };
  
  const [socket] = useState(() => io(process.env.CLIENT_ORIGIN || "http://localhost:3000", {
    withCredentials: true,
    autoConnect: false
  }));
  
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  
  const [stdin, setStdin] = useState('');
  const [stdout, setStdout] = useState('Hello World');
  const [code, setCode] = useState(`#include <iostream>
using namespace std;

int main() {
  cout << "Hello World !!";
}`);
  const [stderr, setStderr] = useState('');
  const [flags, setFlags] = useState('-std=c++17 -Wall');
  const [stdinActive, setStdinActive] = useState(true);
  const [langId, setLangId] = useState(54);
  let [stdoutActive, setStdoutActive] = useState(true);
  let activeGreen = "#86c232";
  let inactiveGreen = "#61892f";

  return (
    <div className="App">
      <SocketContext.Provider value={{ 
        socket, 
        roomId, 
        setRoomId, 
        isConnected, 
        setIsConnected,
        connectedUsers,
        setConnectedUsers
      }}>
        <CodeContext.Provider value={{ 
          langs, 
          stdin, 
          setStdin, 
          stdout, 
          setStdout, 
          code, 
          setCode, 
          stderr, 
          setStderr, 
          flags, 
          setFlags, 
          stdinActive, 
          setStdinActive, 
          langId, 
          setLangId, 
          stdoutActive, 
          setStdoutActive, 
          activeGreen, 
          inactiveGreen 
        }}>
          <BrowserRouter>
            <Routes>
              <Route exact path='/' element={<Home />} />
              <Route path='/new' element={<NewCode />} />
              <Route path='/room/:id' element={<GetCode />} />
            </Routes>
          </BrowserRouter>
        </CodeContext.Provider>
      </SocketContext.Provider>
    </div>
  );
}

export default App;