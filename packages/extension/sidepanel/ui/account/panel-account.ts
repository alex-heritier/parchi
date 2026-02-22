import { ACCOUNT_MODE_BYOK, ACCOUNT_MODE_KEY, ACCOUNT_MODE_PAID, hasConfiguredByokProvider } from './account-mode.js';
import {
  CONVEX_DEPLOYMENT_URL,
  createCreditCheckout,
  getAuthState,
  hasActiveSubscription,
  manageSubscription,
  signInWithOAuth,
  signInWithPassword,
  signOutAccount,
  signUpWithPassword,
} from '../../../convex/client.js';
import { SidePanelUI } from '../core/panel-ui.js';

const setHidden = (element: Element | null | undefined, hidden: boolean) => {
  if (!element) return;
  element.classList.toggle('hidden', hidden);
};

const toUsageLabel = (usage: any) => {
  const requestCount = Number(usage?.requestCount || 0);
  const tokensUsed = Number(usage?.tokensUsed || 0);
  return `${requestCount} req · ${tokensUsed} tokens`;
};

const formatCreditBalance = (cents: number) => {
  const dollars = (cents / 100).toFixed(2);
  return `$${dollars}`;
};

const updateStatusCopy = (ui: any, text: string) => {
  if (ui.elements.accountStatusText) {
    ui.elements.accountStatusText.textContent = text;
  }
  const signedInStatus = document.getElementById('accountStatusTextSignedIn');
  if (signedInStatus) {
    signedInStatus.textContent = text;
  }
};

(SidePanelUI.prototype as any).setAccountUiBusy = function setAccountUiBusy(busy: boolean) {
  const buttonIds = [
    'accountSignInBtn',
    'accountSignUpBtn',
    'accountGoogleBtn',
    'accountGithubBtn',
    'accountUpgradeBtn',
    'accountManageBtn',
    'accountRefreshBtn',
    'accountSignOutBtn',
    'accountChooseByokBtn',
    'accountChoosePaidBtn',
  ];
  buttonIds.forEach((id) => {
    const button = this.elements[id] as HTMLButtonElement | null;
    if (button) {
      button.disabled = busy;
    }
  });
};

(SidePanelUI.prototype as any).bindAccountEventListeners = function bindAccountEventListeners() {
  if (this._accountListenersBound) return;
  this._accountListenersBound = true;

  this.elements.accountChooseByokBtn?.addEventListener('click', () => {
    void this.chooseAccountMode(ACCOUNT_MODE_BYOK);
  });
  this.elements.accountChoosePaidBtn?.addEventListener('click', () => {
    void this.chooseAccountMode(ACCOUNT_MODE_PAID);
  });
  this.elements.accountSignInBtn?.addEventListener('click', () => {
    void this.handleAccountPasswordAuth('signIn');
  });
  this.elements.accountSignUpBtn?.addEventListener('click', () => {
    void this.handleAccountPasswordAuth('signUp');
  });
  this.elements.accountGoogleBtn?.addEventListener('click', () => {
    void this.handleAccountOAuth('google');
  });
  this.elements.accountGithubBtn?.addEventListener('click', () => {
    void this.handleAccountOAuth('github');
  });
  this.elements.accountUpgradeBtn?.addEventListener('click', () => {
    void this.startAccountCheckout();
  });
  this.elements.accountManageBtn?.addEventListener('click', () => {
    void this.openAccountBillingPortal();
  });
  this.elements.accountRefreshBtn?.addEventListener('click', () => {
    void this.refreshAccountPanel();
  });
  this.elements.accountSignOutBtn?.addEventListener('click', () => {
    void this.signOutFromAccount();
  });

  // Credit buy buttons (delegated from the row)
  this.elements.accountBuyCreditsRow?.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement)?.closest('.credit-buy-btn') as HTMLElement | null;
    if (!btn) return;
    const cents = Number(btn.dataset.cents || 0);
    if (cents > 0) void this.startCreditCheckout(cents);
  });
};

(SidePanelUI.prototype as any).initAccountPanel = async function initAccountPanel() {
  this.bindAccountEventListeners();
  await this.refreshAccountPanel({ silent: true });
  await this.showAccountOnboardingIfNeeded();
};

(SidePanelUI.prototype as any).showAccountOnboardingIfNeeded = async function showAccountOnboardingIfNeeded() {
  const stored = await chrome.storage.local.get([
    ACCOUNT_MODE_KEY,
    'configs',
    'activeConfig',
    'provider',
    'apiKey',
    'model',
    'customEndpoint',
  ]);
  const hasChoice = stored[ACCOUNT_MODE_KEY] === ACCOUNT_MODE_BYOK || stored[ACCOUNT_MODE_KEY] === ACCOUNT_MODE_PAID;
  if (hasChoice) {
    setHidden(this.elements.accountOnboardingModal, true);
    return;
  }

  const hasConfiguredProvider = hasConfiguredByokProvider(stored);
  if (hasConfiguredProvider) {
    await chrome.storage.local.set({ [ACCOUNT_MODE_KEY]: ACCOUNT_MODE_BYOK });
    setHidden(this.elements.accountOnboardingModal, true);
    return;
  }

  updateStatusCopy(this, 'Choose Add provider or Paid plan to continue.');
  setHidden(this.elements.accountOnboardingModal, false);
};

(SidePanelUI.prototype as any).chooseAccountMode = async function chooseAccountMode(mode: 'byok' | 'paid') {
  await chrome.storage.local.set({ [ACCOUNT_MODE_KEY]: mode });
  setHidden(this.elements.accountOnboardingModal, true);
  if (mode === ACCOUNT_MODE_BYOK) {
    this.openSettingsPanel?.();
    this.switchSettingsTab?.('setup');
    this.updateStatus('Provider setup selected. Add your API key in Setup.', 'success');
    updateStatusCopy(this, 'Add provider mode selected.');
    return;
  }
  this.openSettingsPanel?.();
  this.switchSettingsTab?.('oauth');
  this.updateStatus('Subscription mode selected. Sign in to continue.', 'active');
  updateStatusCopy(this, 'Sign in to activate paid proxy mode.');
};

(SidePanelUI.prototype as any).handleAccountPasswordAuth = async function handleAccountPasswordAuth(
  mode: 'signIn' | 'signUp',
) {
  const email = String(this.elements.accountEmailInput?.value || '').trim();
  const password = String(this.elements.accountPasswordInput?.value || '').trim();
  if (!email || !password) {
    updateStatusCopy(this, 'Email and password are required.');
    return;
  }

  this.setAccountUiBusy(true);
  try {
    if (mode === 'signIn') {
      await signInWithPassword(email, password);
    } else {
      await signUpWithPassword(email, password);
    }
    await chrome.storage.local.set({ [ACCOUNT_MODE_KEY]: ACCOUNT_MODE_PAID });
    await this.refreshAccountPanel();
    this.updateStatus(mode === 'signIn' ? 'Signed in' : 'Account created', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown auth error');
    updateStatusCopy(this, message);
    this.updateStatus('Authentication failed', 'error');
  } finally {
    this.setAccountUiBusy(false);
  }
};

(SidePanelUI.prototype as any).handleAccountOAuth = async function handleAccountOAuth(provider: 'google' | 'github') {
  this.setAccountUiBusy(true);
  try {
    // OAuth is the paid/proxy path; persist explicit mode to keep runtime gating in sync.
    await chrome.storage.local.set({ [ACCOUNT_MODE_KEY]: ACCOUNT_MODE_PAID });
    const result = await signInWithOAuth(provider);
    const redirect = result?.redirect || '';
    if (redirect) {
      await chrome.tabs.create({ url: redirect });
      updateStatusCopy(this, `Opened ${provider} sign-in. Complete login in the new tab, then refresh.`);
    } else {
      updateStatusCopy(this, `Started ${provider} sign-in flow.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'OAuth failed');
    updateStatusCopy(this, message);
    this.updateStatus('OAuth failed', 'error');
  } finally {
    this.setAccountUiBusy(false);
  }
};

(SidePanelUI.prototype as any).startAccountCheckout = async function startAccountCheckout() {
  // Default upgrade goes to $15 credit pack
  return this.startCreditCheckout(1500);
};

(SidePanelUI.prototype as any).startCreditCheckout = async function startCreditCheckout(packageCents: number) {
  this.setAccountUiBusy(true);
  try {
    const result = await createCreditCheckout(packageCents);
    if (result?.url) {
      await chrome.tabs.create({ url: String(result.url) });
      updateStatusCopy(this, 'Stripe checkout opened in a new tab.');
    } else {
      throw new Error('Checkout URL was not returned.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Checkout failed');
    updateStatusCopy(this, message);
    this.updateStatus('Unable to open checkout', 'error');
  } finally {
    this.setAccountUiBusy(false);
  }
};

(SidePanelUI.prototype as any).openAccountBillingPortal = async function openAccountBillingPortal() {
  this.setAccountUiBusy(true);
  try {
    const result = await manageSubscription();
    if (result?.url) {
      await chrome.tabs.create({ url: String(result.url) });
      updateStatusCopy(this, 'Billing portal opened in a new tab.');
    } else {
      throw new Error('Billing portal URL was not returned.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Billing portal failed');
    updateStatusCopy(this, message);
    this.updateStatus('Unable to open billing portal', 'error');
  } finally {
    this.setAccountUiBusy(false);
  }
};

(SidePanelUI.prototype as any).signOutFromAccount = async function signOutFromAccount() {
  this.setAccountUiBusy(true);
  try {
    await signOutAccount();
    await this.refreshAccountPanel({ silent: true });
    updateStatusCopy(this, 'Signed out.');
    this.updateStatus('Signed out', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Sign-out failed');
    updateStatusCopy(this, message);
    this.updateStatus('Sign out failed', 'error');
  } finally {
    this.setAccountUiBusy(false);
  }
};

(SidePanelUI.prototype as any).refreshAccountPanel = async function refreshAccountPanel({ silent = false } = {}) {
  if (!CONVEX_DEPLOYMENT_URL) {
    setHidden(this.elements.accountAuthUnavailable, false);
    setHidden(this.elements.accountAuthSignedOut, true);
    setHidden(this.elements.accountAuthSignedIn, true);
    updateStatusCopy(this, 'Set CONVEX_URL and rebuild to enable account features.');
    return;
  }

  setHidden(this.elements.accountAuthUnavailable, true);
  this.setAccountUiBusy(true);

  try {
    const state = await getAuthState();
    if (!state.authenticated) {
      setHidden(this.elements.accountAuthSignedOut, false);
      setHidden(this.elements.accountAuthSignedIn, true);
      updateStatusCopy(this, 'Not signed in.');
      if (!silent) this.updateStatus('Account: signed out', 'warning');
      return;
    }

    setHidden(this.elements.accountAuthSignedOut, true);
    setHidden(this.elements.accountAuthSignedIn, false);

    const userEmail = String(state.user?.email || 'Unknown user');
    const sub = state.subscription || null;
    const creditCents = Number(sub?.creditBalanceCents ?? 0);
    const hasCredits = creditCents > 0;
    const paidActive = hasActiveSubscription(sub);
    const hasAccess = hasCredits || paidActive;
    const planLabel = paidActive ? 'Pro (active)' : hasCredits ? 'Credits' : `Free (${sub?.status || 'inactive'})`;

    if (this.elements.accountUserValue) this.elements.accountUserValue.textContent = userEmail;
    if (this.elements.accountCreditBalance) this.elements.accountCreditBalance.textContent = formatCreditBalance(creditCents);
    if (this.elements.accountPlanValue) this.elements.accountPlanValue.textContent = planLabel;
    if (this.elements.accountUsageValue) this.elements.accountUsageValue.textContent = toUsageLabel(sub?.usage);

    if (hasAccess) {
      const stored = await chrome.storage.local.get([ACCOUNT_MODE_KEY]);
      if (stored[ACCOUNT_MODE_KEY] !== ACCOUNT_MODE_PAID) {
        await chrome.storage.local.set({ [ACCOUNT_MODE_KEY]: ACCOUNT_MODE_PAID });
      }
    }

    // Show "Buy Credits" row always; hide legacy upgrade if user has credits or a subscription
    setHidden(this.elements.accountUpgradeBtn, hasAccess);
    setHidden(this.elements.accountManageBtn, !paidActive);
    const statusMsg = hasCredits
      ? `${formatCreditBalance(creditCents)} remaining. Proxy mode available.`
      : paidActive
        ? 'Paid plan active. Proxy mode available.'
        : 'No credits. Buy credits to enable proxy mode.';
    updateStatusCopy(this, statusMsg);
    if (!silent) this.updateStatus('Account refreshed', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Failed to refresh account');
    updateStatusCopy(this, message);
    if (!silent) this.updateStatus('Unable to load account state', 'error');
  } finally {
    this.setAccountUiBusy(false);
  }
};
