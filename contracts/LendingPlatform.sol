// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./LoanTypes.sol";
import "./LoanStorage.sol";

contract LendingPlatform is LoanStorage {
    uint256 public constant MAX_INTEREST_RATE = 7;

    event LoanRequestCreated(
        uint256 indexed requestId,
        address indexed borrower,
        uint256 loanAmount,
        uint256 durationInDays,
        uint256 interestRate,
        uint256 stake
    );

    event LoanFunded(
        uint256 indexed loanId,
        uint256 indexed requestId,
        address indexed lender,
        address borrower,
        uint256 loanAmount,
        uint256 stake,
        uint256 initialEthPrice
    );

    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed lender,
        uint256 repayAmount
    );

    event LoanLiquidated(
        uint256 indexed loanId,
        address indexed lender,
        uint256 stake
    );

    function createLoanRequest(
        uint256 _loanAmount,
        uint256 _durationInDays,
        uint256 _interestRate
    ) external payable {
        require(_loanAmount > 0, "Loan amount must be greater than 0");
        require(_durationInDays > 0, "Duration must be greater than 0");
        require(_interestRate > 0, "Interest rate must be greater than 0");
        require(_interestRate <= MAX_INTEREST_RATE, "Interest rate exceeds maximum allowed (7%)");

        uint256 minCollateral = _loanAmount * 2;
        require(msg.value >= minCollateral, "Collateral must be at least 2x loan amount");

        uint256 requestId = getNextRequestId();
        LoanTypes.LoanRequest storage request = loanRequests[requestId];

        request.borrower = msg.sender;
        request.loanAmount = _loanAmount;
        request.duration = _durationInDays;
        request.isActive = true;
        request.stake = msg.value;
        request.interestRate = _interestRate;

        emit LoanRequestCreated(
            requestId,
            msg.sender,
            _loanAmount,
            _durationInDays,
            _interestRate,
            msg.value
        );
    }

    function fundLoanRequest(
        uint256 _requestId,
        uint256 _initialEthPrice
    ) external payable {
        LoanTypes.LoanRequest storage request = loanRequests[_requestId];

        require(request.isActive, "Request is not active");
        require(request.borrower != address(0), "Invalid request");
        require(msg.value == request.loanAmount, "Must send exact loan amount");

        uint256 loanId = getNextLoanId();
        LoanTypes.ActiveLoan storage loan = activeLoans[loanId];

        loan.borrower = request.borrower;
        loan.lender = msg.sender;
        loan.loanAmount = request.loanAmount;
        loan.stake = request.stake;
        loan.startTimestamp = block.timestamp;
        loan.endTime = block.timestamp + (request.duration * 1 days);
        loan.interestRate = request.interestRate;
        loan.initialEthPrice = _initialEthPrice;
        loan.isRepaid = false;

        request.isActive = false;

        // Send principal to borrower
        payable(request.borrower).transfer(request.loanAmount);

        emit LoanFunded(
            loanId,
            _requestId,
            msg.sender,
            request.borrower,
            request.loanAmount,
            request.stake,
            _initialEthPrice
        );
    }

    // Simple demo interest in ETH:
    // total = principal + principal * rate / 100
    function getRepayAmount(uint256 _loanId) public view returns (uint256) {
        LoanTypes.ActiveLoan storage loan = activeLoans[_loanId];
        require(loan.borrower != address(0), "Invalid loan");
        require(!loan.isRepaid, "Loan already repaid");

        uint256 interest = (loan.loanAmount * loan.interestRate) / 100;
        return loan.loanAmount + interest;
    }

    function repayLoan(uint256 _loanId) external payable {
        LoanTypes.ActiveLoan storage loan = activeLoans[_loanId];

        require(msg.sender == loan.borrower, "Only borrower can repay");
        require(!loan.isRepaid, "Loan already repaid");

        uint256 due = getRepayAmount(_loanId);
        require(msg.value == due, "Repay amount mismatch");

        loan.isRepaid = true;

        (bool ok1, ) = payable(loan.lender).call{value: msg.value}("");
        require(ok1, "Pay lender failed");

        (bool ok2, ) = payable(loan.borrower).call{value: loan.stake}("");
        require(ok2, "Return stake failed");

        emit LoanRepaid(_loanId, loan.borrower, loan.lender, msg.value);
    }

    function checkLoanStatus(
        uint256 _loanId
    )
        external
        view
        returns (
            bool isRepaid,
            uint256 loanAmount,
            uint256 startTimestamp,
            uint256 endTime,
            uint256 interestRate,
            uint256 initialEthPrice
        )
    {
        LoanTypes.ActiveLoan storage loan = activeLoans[_loanId];
        return (
            loan.isRepaid,
            loan.loanAmount,
            loan.startTimestamp,
            loan.endTime,
            loan.interestRate,
            loan.initialEthPrice
        );
    }

    function liquidateExpiredLoan(uint256 _loanId) external {
        LoanTypes.ActiveLoan storage loan = activeLoans[_loanId];

        require(!loan.isRepaid, "Loan is already repaid");
        require(block.timestamp > loan.endTime, "Loan is not expired yet");

        loan.isRepaid = true;

        (bool ok, ) = payable(loan.lender).call{value: loan.stake}("");
        require(ok, "Transfer stake failed");

        emit LoanLiquidated(_loanId, loan.lender, loan.stake);
    }

    function getBorrowerActiveLoans(
        address _borrower
    )
        external
        view
        returns (uint256[] memory loanIds, LoanTypes.LoanRequest[] memory loans)
    {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < totalRequests; i++) {
            if (loanRequests[i].borrower == _borrower) {
                activeCount++;
            }
        }

        loanIds = new uint256[](activeCount);
        loans = new LoanTypes.LoanRequest[](activeCount);

        uint256 arrayIndex = 0;
        for (uint256 i = 0; i < totalRequests; i++) {
            if (loanRequests[i].borrower == _borrower) {
                loanIds[arrayIndex] = i;
                loans[arrayIndex] = loanRequests[i];
                arrayIndex++;
            }
        }
    }

    function getAllActiveLoans()
        external
        view
        returns (
            uint256[] memory loanIds,
            LoanTypes.ActiveLoan[] memory loans,
            uint256[] memory requestIds,
            LoanTypes.LoanRequest[] memory requests
        )
    {
        uint256 activeCount = 0;
        uint256 requestCount = 0;

        for (uint256 i = 0; i < totalLoans; i++) {
            if (!activeLoans[i].isRepaid) {
                activeCount++;
            }
        }
        for (uint256 i = 0; i < totalRequests; i++) {
            if (loanRequests[i].isActive) {
                requestCount++;
            }
        }

        loanIds = new uint256[](activeCount);
        loans = new LoanTypes.ActiveLoan[](activeCount);
        requestIds = new uint256[](requestCount);
        requests = new LoanTypes.LoanRequest[](requestCount);

        uint256 loanIndex = 0;
        for (uint256 i = 0; i < totalLoans; i++) {
            if (!activeLoans[i].isRepaid) {
                loanIds[loanIndex] = i;
                loans[loanIndex] = activeLoans[i];
                loanIndex++;
            }
        }

        uint256 requestIndex = 0;
        for (uint256 i = 0; i < totalRequests; i++) {
            if (loanRequests[i].isActive) {
                requestIds[requestIndex] = i;
                requests[requestIndex] = loanRequests[i];
                requestIndex++;
            }
        }
    }
}
