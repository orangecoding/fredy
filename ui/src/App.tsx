// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React, {useEffect} from 'react';

// @ts-expect-error TS(6142): Module './components/permission/InsufficientPermis... Remove this comment to see the full error message
import InsufficientPermission from './components/permission/InsufficientPermission';
// @ts-expect-error TS(6142): Module './components/permission/PermissionAwareRou... Remove this comment to see the full error message
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
// @ts-expect-error TS(6142): Module './views/generalSettings/GeneralSettings' w... Remove this comment to see the full error message
import GeneralSettings from './views/generalSettings/GeneralSettings';
// @ts-expect-error TS(6142): Module './views/jobs/mutation/JobMutation' was res... Remove this comment to see the full error message
import JobMutation from './views/jobs/mutation/JobMutation';
// @ts-expect-error TS(6142): Module './views/user/mutation/UserMutator' was res... Remove this comment to see the full error message
import UserMutator from './views/user/mutation/UserMutator';
// @ts-expect-error TS(6142): Module './views/jobs/insights/JobInsight.jsx' was ... Remove this comment to see the full error message
import JobInsight from './views/jobs/insights/JobInsight.jsx';
import {useDispatch, useSelector} from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import {Switch, Redirect} from 'react-router-dom';
// @ts-expect-error TS(6142): Module './components/logout/Logout' was resolved t... Remove this comment to see the full error message
import Logout from './components/logout/Logout';
// @ts-expect-error TS(6142): Module './components/logo/Logo' was resolved to 'C... Remove this comment to see the full error message
import Logo from './components/logo/Logo';
// @ts-expect-error TS(6142): Module './components/menu/Menu' was resolved to 'C... Remove this comment to see the full error message
import Menu from './components/menu/Menu';
// @ts-expect-error TS(6142): Module './views/login/Login' was resolved to 'C:/P... Remove this comment to see the full error message
import Login from './views/login/Login';
// @ts-expect-error TS(6142): Module './views/user/Users' was resolved to 'C:/Pr... Remove this comment to see the full error message
import Users from './views/user/Users';
// @ts-expect-error TS(6142): Module './views/jobs/Jobs' was resolved to 'C:/Pro... Remove this comment to see the full error message
import Jobs from './views/jobs/Jobs';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import {Route} from 'react-router';

import './App.less';
// @ts-expect-error TS(6142): Module './components/tracking/TrackingModal.jsx' w... Remove this comment to see the full error message
import TrackingModal from './components/tracking/TrackingModal.jsx';
import {Banner} from '@douyinfe/semi-ui';

export default function FredyApp() {
    const dispatch = useDispatch();
    const [loading, setLoading] = React.useState(true);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    const currentUser = useSelector((state) => state.user.currentUser);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    const settings = useSelector((state) => state.generalSettings.settings);

    useEffect(() => {
        async function init() {
            await dispatch.user.getCurrentUser();
            if (!needsLogin()) {
                await dispatch.provider.getProvider();
                await dispatch.jobs.getJobs();
                await dispatch.jobs.getProcessingTimes();
                await dispatch.notificationAdapter.getAdapter();
                await dispatch.generalSettings.getGeneralSettings();
            }
            setLoading(false);
        }

        init();
    }, [currentUser?.userId]);

    const needsLogin = () => {
        return currentUser == null || Object.keys(currentUser).length === 0;
    };

    const isAdmin = () => currentUser != null && currentUser.isAdmin;

    const login = () => (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Switch>
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Route name="Login" path={'/login'} component={Login}/>
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Redirect from="*" to={'/login'}/>
        </Switch>
    );

    return loading ? null : needsLogin() ? (
        login()
    ) : (
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <div className="app">
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <div className="app__container">
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Logout/>
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Logo width={190} white/>
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Menu isAdmin={isAdmin()}/>

                {settings.demoMode && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Banner fullMode={true}
                            type="info"
                            bordered
                            closeIcon={null}
                            description="You're currently viewing the demo version of Fredy. Jobs won't scrape websites, and any changes you make will be reverted at midnight."
                    />
                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                    <br/>
                </>)}
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                {(settings.analyticsEnabled === null && !settings.demoMode) && <TrackingModal/>}
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Switch>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Route name="Insufficient Permission" path={'/403'} component={InsufficientPermission}/>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Route name="Create new Job" path={'/jobs/new'} component={JobMutation}/>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Route name="Edit a Job" path={'/jobs/edit/:jobId'} component={JobMutation}/>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Route name="Insights into a Job" path={'/jobs/insights/:jobId'} component={JobInsight}/>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Route name="Job overview" path={'/jobs'} component={Jobs}/>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <PermissionAwareRoute
                        name="Create new User"
                        path="/users/new"
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        component={<UserMutator/>}
                        currentUser={currentUser}
                    />
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <PermissionAwareRoute
                        name="Edit a user"
                        path="/users/edit/:userId"
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        component={<UserMutator/>}
                        currentUser={currentUser}
                    />
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <PermissionAwareRoute name="Users" path="/users" component={<Users/>} currentUser={currentUser}/>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <PermissionAwareRoute
                        name="General Settings"
                        path="/generalSettings"
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        component={<GeneralSettings/>}
                        currentUser={currentUser}
                    />

                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Redirect from="/" to={'/jobs'}/>
                </Switch>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            </div>
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        </div>
    );
}

FredyApp.displayName = 'FredyApp';
