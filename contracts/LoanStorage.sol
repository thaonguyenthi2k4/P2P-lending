// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./LoanTypes.sol";

contract LoanStorage {
    using LoanTypes for LoanTypes.LoanRequest;
    using LoanTypes for LoanTypes.ActiveLoan;

    mapping(uint256 => LoanTypes.LoanRequest) public loanRequests;
    mapping(uint256 => LoanTypes.ActiveLoan) public activeLoans;

    uint256 public totalRequests;
    uint256 public totalLoans;

    function getNextRequestId() internal returns (uint256) {
        uint256 id = totalRequests;
        totalRequests += 1;
        return id;
    }

    function getNextLoanId() internal returns (uint256) {
        uint256 id = totalLoans;
        totalLoans += 1;
        return id;
    }
}
