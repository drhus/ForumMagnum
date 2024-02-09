/// <reference types="Cypress" />

describe('Basic Login and Signup', function() {
  beforeEach(function() {
    cy.task('dropAndSeedDatabase');
    cy.fixture('users/testUserUnsetUsername').as('testUserUnsetUsername');
  });

  it('Prompts users to set their display name after signup.', function() {
    const newDisplayname = 'New User 123123';
    cy.loginAs(this.testUserUnsetUsername);
    cy.visit('/');
    cy.contains('Choose your user name').should('exist');
    cy.get('input[type="text"]').type(newDisplayname);
    cy.get('.EAOnboardingStage-footer > button').click();
    cy.get('.EAOnboardingStage-skip').click(); // Skip the subscribe stage
    cy.get('.EAOnboardingStage-skip').click(); // Skip the work stage
    cy.get('.EAOnboardingThankYouStage-button').click(); // Skip the thank you stage
    // This is not a great test, but it should work -
    // the notifications icon should only appear after the user has set their username.
    cy.get(`button.NotificationsMenuButton-buttonClosed`).should('exist');
  });
})
