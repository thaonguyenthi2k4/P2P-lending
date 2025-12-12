import React, { useEffect, useMemo, useState } from "react";
import { Container, Button, Table, Card, Badge, Toast } from "react-bootstrap";
import { ethers } from "ethers";
import LendingPlatformABI from "../contracts/LendingPlatform.abi.json";
import addresses from "../contracts/contract-address.json";

const LoanState = { REPAID: "Repaid", ACTIVE: "Active", EXPIRED: "Expired" };

const Lender = () => {
  const abi = useMemo(() => LendingPlatformABI, []);

  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("");
  const [contract, setContract] = useState(null);

  const [loanRequests, setLoanRequests] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);

  const [toast, setToast] = useState({ show: false, message: "", variant: "success" });
  const showToast = (message, variant = "success") =>
    setToast({ show: true, message, variant });

  useEffect(() => {
    const init = async () => {
      if (!window.ethereum) {
        showToast("Metamask not detected", "danger");
        return;
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const accounts = await provider.listAccounts();

      if (accounts.length > 0) setAccount(accounts[0]);

      window.ethereum.on("accountsChanged", (accs) => {
        setAccount(accs[0] || "");
      });
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBalance = async (address) => {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const bal = await provider.getBalance(address);
    setBalance(ethers.utils.formatEther(bal));
  };

  useEffect(() => {
    const load = async () => {
      if (!window.ethereum || !account) return;

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const instance = new ethers.Contract(addresses.LendingPlatform, abi, signer);
      setContract(instance);

      await updateBalance(account);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, abi]);

  useEffect(() => {
    if (contract && account) {
      loadLoanRequests();
      loadActiveLoans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, account]);

  const getEthPrice = async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      );
      const data = await res.json();
      return data.ethereum.usd;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const loadLoanRequests = async () => {
    if (!contract || !account) return;

    try {
      const [, , requestIds, requests] = await contract.getAllActiveLoans();

      const data = requestIds.map((id, i) => ({
        requestId: id.toString(),
        borrower: requests[i].borrower,
        amount: ethers.utils.formatEther(requests[i].loanAmount),
        duration: requests[i].duration.toString(),
        stake: ethers.utils.formatEther(requests[i].stake),
        interestRate: requests[i].interestRate.toString(),
        isActive: requests[i].isActive,
      }));

      setLoanRequests(
        data.filter(
          (r) => r.isActive && r.borrower.toLowerCase() !== account.toLowerCase()
        )
      );
    } catch (e) {
      console.error(e);
      showToast("Error loading loan requests", "danger");
    }
  };

  const loadActiveLoans = async () => {
    if (!contract || !account) return;

    try {
      const [loanIds, loans] = await contract.getAllActiveLoans();

      const data = loans
        .map((loan, i) => {
          const endMs = loan.endTime.toNumber() * 1000;
          const state = loan.isRepaid
            ? LoanState.REPAID
            : Date.now() > endMs
            ? LoanState.EXPIRED
            : LoanState.ACTIVE;

          return {
            loanId: loanIds[i].toString(),
            borrower: loan.borrower,
            lender: loan.lender,
            amount: ethers.utils.formatEther(loan.loanAmount),
            stake: ethers.utils.formatEther(loan.stake),
            endTime: new Date(endMs).toLocaleString(),
            interestRate: loan.interestRate.toString(),
            initialEthPrice: ethers.utils.formatUnits(loan.initialEthPrice, 18),
            state,
          };
        })
        .filter((l) => l.lender.toLowerCase() === account.toLowerCase());

      setActiveLoans(data);
    } catch (e) {
      console.error(e);
      showToast("Error loading active loans", "danger");
    }
  };

  const fundLoan = async (requestId, amount) => {
    if (!contract) return;

    try {
      const amountWei = ethers.utils.parseEther(amount);
      const price = await getEthPrice();

      if (!price) {
        showToast("Error fetching ETH price", "danger");
        return;
      }

      const initialEthPriceWei = ethers.utils.parseUnits(price.toString(), 18);

      const tx = await contract.fundLoanRequest(requestId, initialEthPriceWei, {
        value: amountWei,
      });

      await tx.wait();

      await loadLoanRequests();
      await loadActiveLoans();
      await updateBalance(account);

      showToast("Loan funded successfully", "success");
    } catch (e) {
      console.error(e);
      showToast(e?.reason || "Error funding loan", "danger");
    }
  };

  const liquidateExpiredLoan = async (loanId) => {
    if (!contract) return;

    try {
      const tx = await contract.liquidateExpiredLoan(loanId);
      await tx.wait();

      await loadLoanRequests();
      await loadActiveLoans();
      await updateBalance(account);

      showToast("Loan liquidated successfully", "success");
    } catch (e) {
      console.error(e);
      showToast(e?.reason || "Error liquidating loan", "danger");
    }
  };

  return (
    <Container className="mt-4">
      <Toast
        show={toast.show}
        onClose={() => setToast({ ...toast, show: false })}
        delay={3000}
        autohide
        style={{ position: "fixed", top: 20, right: 20, zIndex: 9999 }}
      >
        <Toast.Header>
          <strong className="me-auto">Notification</strong>
        </Toast.Header>
        <Toast.Body className={`bg-${toast.variant} text-white`}>
          {toast.message}
        </Toast.Body>
      </Toast>

      <Card className="mb-4">
        <Card.Header as="h5">Lender Dashboard</Card.Header>
        <Card.Body>
          <Card.Text>Connected Account: {account}</Card.Text>
          <Card.Text>
            Balance: {balance ? Number(balance).toFixed(4) : "0"} ETH
          </Card.Text>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
          Available Loan Requests
          <Button variant="outline-primary" onClick={loadLoanRequests}>
            Refresh Requests
          </Button>
        </Card.Header>
        <Card.Body>
          <Table responsive>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Borrower</th>
                <th>Amount</th>
                <th>Stake</th>
                <th>Duration</th>
                <th>Interest Rate</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loanRequests.length === 0 && (
                <tr><td colSpan="8" className="text-center">No active requests</td></tr>
              )}

              {loanRequests.map((r) => (
                <tr key={r.requestId}>
                  <td>{r.requestId}</td>
                  <td>{r.borrower}</td>
                  <td>{r.amount} ETH</td>
                  <td>{r.stake} ETH</td>
                  <td>{r.duration} days</td>
                  <td>{r.interestRate}%</td>
                  <td><Badge bg="success">ACTIVE</Badge></td>
                  <td>
                    <Button variant="primary" onClick={() => fundLoan(r.requestId, r.amount)}>
                      Fund
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
          Your Funded Loans
          <Button variant="outline-primary" onClick={loadActiveLoans}>
            Refresh Loans
          </Button>
        </Card.Header>
        <Card.Body>
          <Table responsive>
            <thead>
              <tr>
                <th>Loan ID</th>
                <th>Borrower</th>
                <th>Amount</th>
                <th>Stake</th>
                <th>End Time</th>
                <th>Interest Rate</th>
                <th>Initial ETH Price</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeLoans.length === 0 && (
                <tr><td colSpan="9" className="text-center">No funded loans</td></tr>
              )}

              {activeLoans.map((l) => (
                <tr key={l.loanId}>
                  <td>{l.loanId}</td>
                  <td>{l.borrower}</td>
                  <td>{l.amount} ETH</td>
                  <td>{l.stake} ETH</td>
                  <td>{l.endTime}</td>
                  <td>{l.interestRate}%</td>
                  <td>${Number(l.initialEthPrice).toFixed(2)}</td>
                  <td>
                    <Badge
                      bg={
                        l.state === LoanState.ACTIVE
                          ? "warning"
                          : l.state === LoanState.REPAID
                          ? "success"
                          : "danger"
                      }
                    >
                      {l.state}
                    </Badge>
                  </td>
                  <td>
                    {l.state === LoanState.EXPIRED && (
                      <Button variant="danger" onClick={() => liquidateExpiredLoan(l.loanId)}>
                        Liquidate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default Lender;
