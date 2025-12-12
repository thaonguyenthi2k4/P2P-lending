// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LoanTypes {
    struct LoanRequest {
        address borrower;
        uint256 loanAmount;    // wei
        uint256 duration;      // days
        bool isActive;
        uint256 stake;         // wei
        uint256 interestRate;  // %
    }

    struct ActiveLoan {
        address borrower;
        address lender;
        uint256 loanAmount;     // wei
        uint256 startTimestamp; // unix
        uint256 stake;          // wei
        uint256 endTime;        // unix
        uint256 interestRate;   // %
        bool isRepaid;
        uint256 initialEthPrice; // USD price scaled 1e18 (frontend passes parseUnits)
    }
}
