import React, { useState } from 'react';
import { getAppServices } from '../core/bootstrap/appBootstrap';
import './SubscriptionSection.css';

const billingService = getAppServices().billing;

const SubscriptionSection = ({ user, userPlan: userPlanProp }) => {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const userPlan = userPlanProp ?? user?.plan ?? 'Free';

  const handleCheckout = async (planId) => {
    if (planId === 'free') return;
    setLoadingPlan(planId);

    try {
      const url = await billingService.startCheckout({
        uid: user.uid,
        planId,
        successUrl: window.location.origin + '/dashboard?payment=success',
        cancelUrl: window.location.origin + '/dashboard?payment=cancel',
      });

      if (url) {
        window.location.assign(url);
      } else {
        setLoadingPlan(null);
      }
    } catch (err) {
      console.error("Eroare checkout:", err);
      setLoadingPlan(null);
      alert("Nu s-a putut iniția sesiunea de plată.");
    }
  };

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '0 lei',
      features: ['15 GB Stocare Cloud', 'Galerii nelimitate', 'Branding de bază'],
      isCurrent: userPlan === 'Free',
      cta: 'Plan Actual'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '100 lei',
      period: '/lună',
      features: ['500 GB Stocare Cloud', 'Branding Personalizat', 'URL-uri Custom (slugs)', 'Suport Prioritar'],
      isCurrent: userPlan === 'Pro',
      cta: 'Treci la Pro',
      highlight: true
    },
    {
      id: 'unlimited',
      name: 'Unlimited',
      price: '150 lei',
      period: '/lună',
      features: ['1 TB Stocare Cloud', 'Tot ce include Pro', 'Domeniu Personalizat', 'Suport WhatsApp'],
      isCurrent: userPlan === 'Unlimited',
      cta: 'Alege Unlimited',
      highlight: false
    }
  ];

  return (
    <div className="sub-wrapper">
      <div className="sub-header">
        <h2 className="sub-display-title">Alege planul potrivit <em>viziunii tale.</em></h2>
        <p className="sub-display-sub">Scalabilitate maximă pentru portofoliul tău profesional.</p>
      </div>

      <div className="sub-pricing-grid">
        {plans.map((plan) => (
          <div key={plan.id} className={`sub-plan-card ${plan.highlight ? 'pro-featured' : ''}`}>
            {plan.highlight && <div className="sub-plan-badge">Cel mai ales</div>}
            <h3 className="sub-plan-name">{plan.name}</h3>
            <div className="sub-plan-price">
              {plan.price}
              {plan.period && <span className="sub-period">{plan.period}</span>}
            </div>
            <ul className="sub-plan-features">
              {plan.features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            <button 
              className={`sub-plan-btn ${plan.highlight ? 'btn-gold-filled' : 'btn-outline'}`}
              onClick={() => handleCheckout(plan.id)}
              disabled={plan.isCurrent || (loadingPlan && loadingPlan !== plan.id)}
            >
              {loadingPlan === plan.id ? 'Se încarcă...' : plan.isCurrent ? 'Planul tău' : plan.cta}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubscriptionSection;
