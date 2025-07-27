// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract HTLCEscrow {
    struct HTLC {
        address sender;
        address recipient;
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        bytes32 preimage;
    }
    
    mapping(bytes32 => HTLC) public htlcs;
    
    event HTLCCreated(
        bytes32 indexed htlcId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );
    
    event HTLCWithdrawn(bytes32 indexed htlcId, bytes32 preimage);
    event HTLCRefunded(bytes32 indexed htlcId);
    
    function createHTLC(
        address _recipient,
        address _token,
        uint256 _amount,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable returns (bytes32 htlcId) {
        require(_timelock > block.timestamp, "Timelock must be in the future");
        require(_amount > 0, "Amount must be greater than 0");
        
        htlcId = keccak256(
            abi.encodePacked(
                msg.sender,
                _recipient,
                _token,
                _amount,
                _hashlock,
                _timelock
            )
        );
        
        require(htlcs[htlcId].sender == address(0), "HTLC already exists");
        
        if (_token == address(0)) {
            require(msg.value == _amount, "ETH amount mismatch");
        } else {
            require(msg.value == 0, "ETH sent for token transfer");
            require(
                IERC20(_token).transferFrom(msg.sender, address(this), _amount),
                "Token transfer failed"
            );
        }
        
        htlcs[htlcId] = HTLC({
            sender: msg.sender,
            recipient: _recipient,
            token: _token,
            amount: _amount,
            hashlock: _hashlock,
            timelock: _timelock,
            withdrawn: false,
            refunded: false,
            preimage: bytes32(0)
        });
        
        emit HTLCCreated(
            htlcId,
            msg.sender,
            _recipient,
            _token,
            _amount,
            _hashlock,
            _timelock
        );
    }
    
    function withdraw(bytes32 _htlcId, bytes32 _preimage) external {
        HTLC storage htlc = htlcs[_htlcId];
        
        require(htlc.sender != address(0), "HTLC does not exist");
        require(htlc.recipient == msg.sender, "Not recipient");
        require(!htlc.withdrawn, "Already withdrawn");
        require(!htlc.refunded, "Already refunded");
        require(
            sha256(abi.encodePacked(_preimage)) == htlc.hashlock,
            "Invalid preimage"
        );
        
        htlc.withdrawn = true;
        htlc.preimage = _preimage;
        
        if (htlc.token == address(0)) {
            payable(htlc.recipient).transfer(htlc.amount);
        } else {
            require(
                IERC20(htlc.token).transfer(htlc.recipient, htlc.amount),
                "Token transfer failed"
            );
        }
        
        emit HTLCWithdrawn(_htlcId, _preimage);
    }
    
    function refund(bytes32 _htlcId) external {
        HTLC storage htlc = htlcs[_htlcId];
        
        require(htlc.sender != address(0), "HTLC does not exist");
        require(htlc.sender == msg.sender, "Not sender");
        require(!htlc.withdrawn, "Already withdrawn");
        require(!htlc.refunded, "Already refunded");
        require(block.timestamp >= htlc.timelock, "Timelock not expired");
        
        htlc.refunded = true;
        
        if (htlc.token == address(0)) {
            payable(htlc.sender).transfer(htlc.amount);
        } else {
            require(
                IERC20(htlc.token).transfer(htlc.sender, htlc.amount),
                "Token transfer failed"
            );
        }
        
        emit HTLCRefunded(_htlcId);
    }
    
    function getHTLC(bytes32 _htlcId) external view returns (
        address sender,
        address recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        bool withdrawn,
        bool refunded,
        bytes32 preimage
    ) {
        HTLC memory htlc = htlcs[_htlcId];
        return (
            htlc.sender,
            htlc.recipient,
            htlc.token,
            htlc.amount,
            htlc.hashlock,
            htlc.timelock,
            htlc.withdrawn,
            htlc.refunded,
            htlc.preimage
        );
    }
}