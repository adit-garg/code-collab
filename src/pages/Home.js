// import { useContext, useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { SocketContext } from '../contexts/SocketContext';
// import 'bootstrap/dist/css/bootstrap.min.css';

// function Home() {
//     const navigate = useNavigate();
//     const { setRoomId } = useContext(SocketContext);
//     const [joinRoomId, setJoinRoomId] = useState('');
//     const [isCreating, setIsCreating] = useState(false);

//     const createNewRoom = async () => {
//         setIsCreating(true);
//         try {
//             const response = await fetch('http://localhost:8000/create-room', {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' }
//             });

//             if (!response.ok) {
//                 const errData = await response.text();
//                 throw new Error(`Server responded with ${response.status}: ${errData}`);
//             }

//             const data = await response.json();
//             setRoomId(data.roomId);
//             navigate(`/room/${data.roomId}`);
//         } catch (error) {
//             const readableError = error?.message || error?.error || JSON.stringify(error, null, 2);
//             console.error("ERROR", readableError);
//             alert('Failed to create room. Please try again.');
//         } finally {
//             setIsCreating(false);
//         }
//     };

//     const joinExistingRoom = () => {
//         try {
//             if (joinRoomId.trim()) {
//                 setRoomId(joinRoomId);
//                 navigate(`/room/${joinRoomId}`);
//             } else {
//                 alert('Please enter a valid room ID');
//             }
//         } catch (error) {
//             const readableError = error?.message || error?.error || JSON.stringify(error, null, 2);
//             console.error("ERROR", readableError);
//             alert("Failed to join room. Please try again.");
//         }
//     };

//     const createSoloSession = () => {
//         try {
//             navigate('/new');
//         } catch (error) {
//             const readableError = error?.message || error?.error || JSON.stringify(error, null, 2);
//             console.error("ERROR", readableError);
//             alert("Failed to start solo session.");
//         }
//     };

//     return (
//         <div className="container mt-5">
//             <div className="row justify-content-center">
//                 <div className="col-md-8">
//                     <div className="text-center mb-5">
//                         <h1 className="display-4 text-primary">C++ Online Compiler</h1>
//                         <p className="lead">Collaborate in real-time or work solo</p>
//                     </div>
                    
//                     <div className="row">
//                         <div className="col-md-6 mb-4">
//                             <div className="card h-100">
//                                 <div className="card-body text-center">
//                                     <h5 className="card-title">Create New Room</h5>
//                                     <p className="card-text">Start a new collaborative session and invite friends</p>
//                                     <button 
//                                         className="btn btn-primary btn-lg"
//                                         onClick={createNewRoom}
//                                         disabled={isCreating}
//                                     >
//                                         {isCreating ? 'Creating...' : 'Create Room'}
//                                     </button>
//                                 </div>
//                             </div>
//                         </div>
                        
//                         <div className="col-md-6 mb-4">
//                             <div className="card h-100">
//                                 <div className="card-body text-center">
//                                     <h5 className="card-title">Join Existing Room</h5>
//                                     <p className="card-text">Enter a room ID to join a collaborative session</p>
//                                     <div className="mb-3">
//                                         <input
//                                             type="text"
//                                             className="form-control"
//                                             placeholder="Enter Room ID"
//                                             value={joinRoomId}
//                                             onChange={(e) => setJoinRoomId(e.target.value)}
//                                             onKeyPress={(e) => e.key === 'Enter' && joinExistingRoom()}
//                                         />
//                                     </div>
//                                     <button 
//                                         className="btn btn-success btn-lg"
//                                         onClick={joinExistingRoom}
//                                     >
//                                         Join Room
//                                     </button>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
                    
//                     <div className="text-center mt-4">
//                         <button 
//                             className="btn btn-outline-secondary btn-lg"
//                             onClick={createSoloSession}
//                         >
//                             Work Solo (No Collaboration)
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// }

// export default Home;

import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SocketContext } from '../contexts/SocketContext';
import './Home.css'; // We'll need to create this CSS file

function Home() {
    const navigate = useNavigate();
    const { setRoomId } = useContext(SocketContext);
    const [joinRoomId, setJoinRoomId] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const createNewRoom = async () => {
        setIsCreating(true);
        try {
            const response = await fetch(`${process.env.CLIENT_ORIGIN || 'http://localhost:8000'}/create-room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const errData = await response.text();
                throw new Error(`Server responded with ${response.status}: ${errData}`);
            }

            const data = await response.json();
            setRoomId(data.roomId);
            navigate(`/room/${data.roomId}`);
        } catch (error) {
            const readableError = error?.message || error?.error || JSON.stringify(error, null, 2);
            console.error("ERROR", readableError);
            alert('Failed to create room. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    const joinExistingRoom = () => {
        try {
            if (joinRoomId.trim()) {
                setRoomId(joinRoomId);
                navigate(`/room/${joinRoomId}`);
            } else {
                alert('Please enter a valid room ID');
            }
        } catch (error) {
            const readableError = error?.message || error?.error || JSON.stringify(error, null, 2);
            console.error("ERROR", readableError);
            alert("Failed to join room. Please try again.");
        }
    };

    const createSoloSession = () => {
        try {
            navigate('/new');
        } catch (error) {
            const readableError = error?.message || error?.error || JSON.stringify(error, null, 2);
            console.error("ERROR", readableError);
            alert("Failed to start solo session.");
        }
    };

    return (
        <div className="home-container">
            <div className="home-content">
                {/* Title Section */}
                <div className="home-header">
                    <h1 className="home-title">C++ Online Compiler</h1>
                    <p className="home-subtitle">Collaborate in real-time or work solo</p>
                </div>

                {/* Action Cards */}
                <div className="home-cards">
                    {/* Create Room Card */}
                    <div className="home-card">
                        <div className="card-content">
                            <div className="card-icon">🚀</div>
                            <h3 className="card-title">Create New Room</h3>
                            <p className="card-description">Start a new collaborative session and invite friends</p>
                            <button 
                                className="home-btn btn-primary"
                                onClick={createNewRoom}
                                disabled={isCreating}
                            >
                                {isCreating ? 'Creating...' : 'Create Room'}
                            </button>
                        </div>
                    </div>

                    {/* Join Room Card */}
                    <div className="home-card">
                        <div className="card-content">
                            <div className="card-icon">🤝</div>
                            <h3 className="card-title">Join Existing Room</h3>
                            <p className="card-description">Enter a room ID to join a collaborative session</p>
                            <div className="input-group">
                                <input
                                    type="text"
                                    className="home-input"
                                    placeholder="Enter Room ID"
                                    value={joinRoomId}
                                    onChange={(e) => setJoinRoomId(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && joinExistingRoom()}
                                />
                            </div>
                            <button 
                                className="home-btn btn-success"
                                onClick={joinExistingRoom}
                            >
                                Join Room
                            </button>
                        </div>
                    </div>
                </div>

                {/* Solo Session Button */}
                <div className="home-solo">
                    <button 
                        className="home-btn btn-outline"
                        onClick={createSoloSession}
                    >
                        <span className="solo-icon">💻</span>
                        Work Solo (No Collaboration)
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Home;
